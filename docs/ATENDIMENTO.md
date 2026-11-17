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
- O endereço do webhook leva um **segredo por canal** (`?s=…`), e na API oficial a **assinatura da Meta** (`X-Hub-Signature-256`) também é conferida quando o App Secret está configurado.
- A service_role do Supabase **não é usada** em nenhum ponto.

## Passo 1: ativar no servidor (uma vez)

1. Gere uma chave aleatória (PowerShell):
   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
   ```
2. **Banco de produção** (Supabase → SQL Editor), nesta ordem:
   1. Cole e rode `supabase/aplicar-migracoes-5-e-6.sql` (só se o banco já tem as migrações 1 a 4).
   2. Rode: `select public.set_internal_key('COLE_A_CHAVE_AQUI');`
3. **Vercel** → Settings → Environment Variables: crie `ALTUM_INTERNAL_KEY` com a **mesma chave**, em Production (e Preview, se quiser testar). Opcionalmente `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`.
4. Faça um **novo deploy** (Deployments → Redeploy, ou um `git push`).
5. Apague a chave de qualquer arquivo temporário. Ela fica só na Vercel e (como hash) no banco.

> Importante: aplique as migrações **antes** do deploy do código novo. As telas de Conversas, Suporte e Análises dependem delas.

## Passo 2A: conectar pela API oficial (Meta)

Recomendada para operar com clientes. Estável e permitida pelo WhatsApp.

Você precisa de: conta no **Meta Business**, um **app** em developers.facebook.com com o produto **WhatsApp**, e um número que não esteja em uso no WhatsApp comum.

1. No Altum: **WhatsApp → Conectar número → API oficial**.
   - **ID do número de telefone:** painel da Meta → WhatsApp → Configuração da API.
   - **Token de acesso permanente:** crie um usuário do sistema em Business Settings e gere um token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`. O token temporário de 24 h não serve em produção.
   - **App Secret** (recomendado): painel da Meta → Configurações do app → Básico.
2. No canal criado, clique em **Webhook**. Copie a **URL de callback** e o **Token de verificação**.
3. Na Meta: WhatsApp → Configuração → Webhook → Editar, cole os dois, salve e **assine o campo `messages`**.
4. No Altum, clique em **Verificar**: o status deve ficar **Conectado**.

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
- Atualização **em tempo real**: a tela consulta a cada 4 s (conversa aberta) e 8 s (lista).
- Respostas automáticas e chatbot.

## Se algo não funcionar

| Sintoma | Causa provável |
|---|---|
| Aviso "Falta ativar o Atendimento no servidor" | `ALTUM_INTERNAL_KEY` ausente na Vercel, ou sem novo deploy depois de criá-la |
| "Não autorizado" nos logs | A chave da Vercel não é a mesma usada em `set_internal_key` |
| Mensagens não chegam (API oficial) | Campo `messages` não assinado, URL/token errados, ou App Secret incorreto |
| Mensagens não chegam (QR Code) | Webhook não configurado no servidor: clique em Ler QR Code de novo para reconfigurar |
| "Passaram mais de 24 horas…" | Regra da API oficial: espere o cliente escrever |
| Status "Com problema" | Leia o detalhe no cartão do canal; clique em Verificar depois de corrigir |
