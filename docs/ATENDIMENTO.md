# Atendimento: WhatsApp, Conversas e Suporte interno

Este guia ativa o módulo de Atendimento em produção. Tempo estimado: 20 minutos (sem contar a configuração na Meta ou o servidor de QR Code).

## O que existe

| Tela | Para quê |
|---|---|
| **WhatsApp** | O administrador conecta o número da empresa: pela **API oficial (Meta)** ou lendo um **QR Code** |
| **Conversas** | Caixa de entrada compartilhada: lista, conversa, responsável, status, criar contato, nova conversa |
| **Suporte interno** | Chamados do time (dúvidas, problemas, pedidos) com comentários, prioridade e responsável |
| **Análises** | Receita, conversão, ciclo, ranking, origem, motivos de perda, tempo de resposta |

## Como a segurança funciona

- Os **segredos de cada canal** (token da Meta, chave do servidor de QR Code) ficam numa tabela do banco **sem nenhum acesso direto**. Nem o administrador consegue ler de volta o que salvou: só vê quais campos estão preenchidos.
- Os **webhooks** (a Meta ou o servidor de QR Code avisando que chegou mensagem) não têm usuário logado. Eles gravam no banco com uma **chave interna** (`ALTUM_INTERNAL_KEY`) que só o servidor conhece. Sem ela, o banco recusa.
- API oficial: um **webhook único** (`/api/whatsapp/webhook`) para o app da Meta da Agência. Toda chamada precisa da **assinatura da Meta** (`X-Hub-Signature-256`, conferida com `META_APP_SECRET`); sem o segredo configurado, tudo é recusado. Cada número só pode estar em uma organização, e o canal é encontrado pelo ID do número que a Meta manda.
- QR Code (e canais antigos da API oficial): o endereço do webhook leva um **segredo por canal** (`?s=…`).
- A service_role do Supabase **não é usada** em nenhum ponto.

## Passo 1: ativar no servidor (uma vez)

1. Gere uma chave aleatória (PowerShell):
   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
   ```
2. **Banco de produção** (Supabase → SQL Editor), nesta ordem:
   1. Cole e rode `supabase/aplicar-migracoes-5-e-6.sql` (só se o banco já tem as migrações 1 a 4).
   2. Cole e rode `supabase/aplicar-migracoes-7-a-10.sql` (tempo real, respostas rápidas, contatos com telefone único/etiquetas/campos e WhatsApp pelo app da Agência). **Atenção:** ela junta automaticamente contatos duplicados pelo telefone no mais antigo (nada é perdido; o que não couber vai para as observações).
   3. Rode: `select public.set_internal_key('COLE_A_CHAVE_AQUI');`
3. **Vercel** → Settings → Environment Variables: crie `ALTUM_INTERNAL_KEY` com a **mesma chave**, em Production (e Preview, se quiser testar). Opcionalmente `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`.
4. Faça um **novo deploy** (Deployments → Redeploy, ou um `git push`).
5. Apague a chave de qualquer arquivo temporário. Ela fica só na Vercel e (como hash) no banco.

> Importante: aplique as migrações **antes** do deploy do código novo. As telas de Conversas, Suporte e Análises dependem delas.

## Passo 2A: API oficial (Meta), no modelo do wacrm

Recomendada para operar com clientes. Estável e permitida pelo WhatsApp. Funciona com **um app da Meta da Agência** para todos os clientes: a Agência configura o app e o webhook **uma vez**, e cada cliente só informa os dados do número dele.

### Uma vez, pela Agência

1. Em developers.facebook.com, crie um app do tipo **Empresa** no portfólio da Agência e adicione o produto **WhatsApp**.
2. Em Configurações do app → Básico: copie a **Chave secreta do app** e o **ID do app**. Preencha o link da política de privacidade (`https://<domínio>/privacidade`) e coloque o app em modo **Ao vivo** (Live). Em modo de desenvolvimento a Meta só entrega mensagens de números de teste.
3. Gere um texto aleatório para o token de verificação (o mesmo comando do Passo 1 serve).
4. **Vercel** → Environment Variables: `META_APP_SECRET` (a chave secreta), `META_VERIFY_TOKEN` (o texto do item 3) e `META_APP_ID` (opcional, recomendado). Faça um novo deploy.
5. No app da Meta: WhatsApp → Configuração → Webhook → Editar:
   - URL de callback: `https://<domínio>/api/whatsapp/webhook`
   - Token de verificação: o mesmo `META_VERIFY_TOKEN`
   - Salve e **assine o campo `messages`**.
6. Em Configurações do negócio → Usuários do sistema, crie um usuário do sistema (Administrador) da Agência.

### Para cada número de cliente

Pré-requisitos na Meta: a conta WhatsApp Business (WABA) do cliente compartilhada com o portfólio da Agência (ou criada nele), um número que **não esteja em uso no WhatsApp do celular**, nome de exibição aprovado, **PIN de verificação em duas etapas** definido (WhatsApp Manager → Números de telefone) e **forma de pagamento** cadastrada no WhatsApp Manager (para modelos e conversas iniciadas pela empresa).

1. Em Usuários do sistema, **adicione o ativo** (a conta do WhatsApp do cliente) ao usuário do sistema e gere um **token permanente** para o app da Agência, com `whatsapp_business_management` e `whatsapp_business_messaging`. O token temporário de 24 h não serve.
2. No Altum do cliente: **WhatsApp → Conectar número → API oficial** e preencha: **ID do número**, **ID da conta do WhatsApp Business**, **token** e **PIN**. Os dois IDs estão em WhatsApp → Configuração da API.
3. Ao clicar em **Conectar**, o Altum faz sozinho, nesta ordem:
   1. confere se o token lê o número (`verify_number`);
   2. confere se o número pertence àquela conta (`waba_phone_numbers`), um erro comum que faz as mensagens nunca chegarem;
   3. registra o número na API com o PIN (`register`);
   4. inscreve a conta no app da Agência (`subscribe_waba`), que é o que faz as mensagens chegarem.

   Se algo falhar, a tela diz o que corrigir e mostra a etapa, o código da Meta e o Trace ID para levar ao suporte da Meta. Falhas nas etapas 1 e 2 não salvam nada. Falhas nas etapas 3 e 4 salvam o canal com status "Com problema": corrija e use **Reconectar**.
4. **Verificar** confere o número e se a conta está inscrita no app da Agência (detecta o caso "conectado, mas as mensagens não chegam"). **Reconectar** refaz o registro (com PIN) e a inscrição.

> Canais da API oficial criados antes desta versão usam o webhook próprio (`/api/whatsapp/<canal>?s=…`) e continuam funcionando. Para passar ao app da Agência, edite o canal, informe o ID da conta do WhatsApp Business, salve e clique em Reconectar.

**Regra das 24 horas:** a API oficial só permite resposta livre até 24 horas depois da última mensagem do cliente. Passado esse prazo, só com **modelo de mensagem aprovado**. O Altum bloqueia o envio fora da janela e explica o motivo. O envio de modelos ainda não está implementado.

## Passo 2B: conectar por QR Code

Mais rápido, sem limite de 24 horas, mas **não é oficial**: o WhatsApp pode bloquear o número. Use um chip dedicado, nunca o principal.

Precisa de um servidor **Evolution API v2** próprio, com endereço **https** público (VPS, Railway, etc.). O Altum não hospeda isso.

1. No Altum: **WhatsApp → Conectar número → QR Code**. Informe o endereço e a chave (`apikey`) do servidor, ou deixe em branco se `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` estiverem na Vercel.
2. Clique em **Ler QR Code** e escaneie no celular (WhatsApp → Aparelhos conectados → Conectar um aparelho). A tela fecha sozinha ao conectar.
3. O Altum cria a instância e aponta o webhook do servidor para `…/api/whatsapp/<canal>?s=<segredo>` automaticamente.

O endereço do servidor precisa ser **https** e público: o Altum recusa `localhost` e IPs de rede interna, por segurança.

## O que ainda não existe

- Envio de **mídias** (imagem, áudio, documento). Mensagens recebidas com mídia aparecem como `[imagem]`, `[áudio]` etc.
- **Modelos de mensagem** (templates) da API oficial.
- Respostas automáticas e chatbot.

## Respostas rápidas

Textos prontos da empresa. Administrador e gerente cadastram em **Administração → Respostas rápidas**; toda a equipe usa. Na conversa, digite `/` e o atalho (ex.: `/preco`) ou clique no botão de raio ao lado da caixa de mensagem. Setas escolhem, Enter ou Tab insere, Esc fecha. O texto entra na caixa para revisar antes de enviar. `{{primeiro_nome}}` e `{{nome}}` viram o nome do cliente; se só houver o número, somem da frase. Precisa da migração `20261124000100_quick_replies.sql`.

## Tempo real

Conversas, mensagens e o sino de notificações atualizam na hora (Supabase Realtime), sem recarregar a página. Para ligar, rode `supabase/migrations/20261124000000_realtime.sql` no SQL Editor (pode rodar mais de uma vez sem problema). Sem essa migração tudo continua funcionando, só que pela consulta periódica antiga (a cada 4 s na conversa aberta e 8 s na lista). Com o tempo real ativo, essa consulta continua como reserva, mas bem mais espaçada (30 s e 60 s).

## Se algo não funcionar

| Sintoma | Causa provável |
|---|---|
| Aviso "Falta ativar o Atendimento no servidor" | `ALTUM_INTERNAL_KEY` ausente na Vercel, ou sem novo deploy depois de criá-la |
| "Não autorizado" nos logs | A chave da Vercel não é a mesma usada em `set_internal_key` |
| Mensagens não chegam (API oficial) | Campo `messages` não assinado, URL/token errados, ou App Secret incorreto |
| Mensagens não chegam (QR Code) | Webhook não configurado no servidor: clique em Ler QR Code de novo para reconfigurar |
| "Passaram mais de 24 horas…" | Regra da API oficial: espere o cliente escrever |
| Status "Com problema" | Leia o detalhe no cartão do canal; clique em Verificar depois de corrigir |
