# Segurança e privacidade

## Como os dados ficam isolados

1. **Banco (a defesa principal).** Toda tabela de dados tem `org_id` e *Row Level Security*. As políticas usam `is_org_member`, `is_org_admin` e `is_org_manager`. Mesmo que um bug de interface tente ler dados de outra empresa, o Postgres devolve zero linhas.
2. **Vínculos seguros.** Contato, empresa, negócio, tarefa e responsável são ligados por chave estrangeira composta `(org_id, id)`: é impossível referenciar um item de outra organização.
3. **Privilégio mínimo.** O papel `authenticated` só recebe as colunas que precisa (por exemplo, não existe permissão de alterar `org_id` ou `created_by`). Criar organização, aceitar convite e criar funil passam por funções, não por `insert` direto.
4. **Papéis aplicados no banco.** Vendedor não exclui contatos/negócios nem mexe em configurações; só administrador convida, remove e edita funis; auditoria só o administrador lê.
5. **Provas automáticas.** `npm test` roda as migrações reais num Postgres embutido e executa ~65 cenários de ataque e permissão. Foi validado com *testes de mutação*: sabotando de propósito uma política, os testes falham.

## O que o app faz além do banco

- Senhas tratadas pelo Supabase Auth (hash forte, nunca passam pelo nosso código além do envio).
- Sessão em cookies `httpOnly`, renovada no `proxy.ts`; rotas do app exigem login e organização.
- Cabeçalhos: Content-Security-Policy restritiva, `X-Frame-Options: DENY`, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Convites: token aleatório (UUID), só vale para o e-mail convidado, expira em 7 dias, uso único.
- Redirecionamento pós-login só aceita `/convite/<uuid>` (sem *open redirect*).
- Exportação CSV neutraliza injeção de fórmulas (`=`, `+`, `-`, `@`).
- Busca: termos são higienizados antes de entrar nos filtros do PostgREST.
- Chave do navegador é a *publishable* (pública por natureza); a `service_role` **nunca** é usada.
- Auditoria guarda só os **nomes** dos campos alterados, nunca o conteúdo, para não duplicar dados pessoais.

## LGPD (resumo prático)

- A empresa cliente é **controladora** dos dados dos contatos; o Altum CRM é **operador**. Isso está nos Termos e na Política de Privacidade (`/termos`, `/privacidade`).
- **Eliminação:** o administrador exclui a organização inteira (Administração → Organização) e tudo é apagado em cascata. Contatos individuais podem ser excluídos por administrador/gerente.
- **Portabilidade/acesso:** exportação CSV dos contatos.
- **Cookies:** apenas os essenciais de sessão (sem rastreadores).
- **Suboperadores:** Supabase (São Paulo) e Vercel.

## Limitações conhecidas (decisões conscientes)

| Item | Situação | Quando resolver |
|---|---|---|
| CSP usa `'unsafe-inline'` em scripts | Necessário ao Next sem nonce por requisição | Migrar para nonce se o requisito de conformidade exigir |
| Sem limite de tentativas próprio no login | Usa os limites do Supabase Auth | Ao escalar, adicionar CAPTCHA (Turnstile) no cadastro |
| Sem autenticação em dois fatores | Supabase suporta TOTP | Fase 2 (Perfil → Segurança) |
| Uma organização ativa por usuário (a primeira) | Seletor de organização não construído | Quando houver usuários em várias empresas |
| Backups | Dependem do plano do Supabase | Assinar Pro antes de ter clientes |

## Antes de vender

- [ ] **Revisão jurídica** dos Termos e da Política de Privacidade por advogado (os textos são um modelo bem fundamentado, não aconselhamento jurídico).
- [ ] Definir DPO/encarregado e e-mail de privacidade (`NEXT_PUBLIC_PRIVACY_EMAIL`).
- [ ] E-mails de confirmação e de recuperação de senha em português, via SMTP próprio (a recuperação de senha já está construída: precisa só do SMTP e dos modelos de e-mail).
- [ ] Plano **Pro** do Supabase (backups diários, sem pausa por inatividade).
- [ ] **Cobrança** (Stripe ou Asaas) e limites por plano: não implementados.
- [ ] Monitoramento de erros (Sentry) e alertas de uptime.
- [ ] Teste de restauração de backup.
- [ ] Registro de marca/domínio do nome "Altum CRM".

## Em caso de incidente

1. Gire as chaves (Supabase → Project Settings → API) e atualize na Vercel.
2. Consulte a aba **Auditoria** de cada organização afetada.
3. Se houver risco relevante a titulares, comunique-os e a ANPD (LGPD, art. 48).
