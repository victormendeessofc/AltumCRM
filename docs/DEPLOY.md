# Publicar o Altum CRM

Tempo estimado: 30 a 45 minutos na primeira vez. Você vai precisar de contas no **GitHub**, **Supabase** e **Vercel** (todas têm plano gratuito suficiente para começar).

## Recomendação: dois projetos Supabase

- **Desenvolvimento** (o que você já usa): para testar sem medo.
- **Produção** (novo): só com dados reais de clientes.

Misturar os dois é o erro mais comum. Crie um projeto novo para produção.

---

## 1. Banco de produção (Supabase)

1. supabase.com → **New project** → nome `altum-crm-prod`, região **South America (São Paulo)**, gere e guarde a senha do banco.
2. No repositório, rode `npm run db:bundle`. Abra `supabase/schema-completo.sql`, copie tudo.
3. No projeto novo: **SQL Editor → New query**, cole, **Run**. Deve aparecer "Success".
4. **Authentication → Sign In / Providers → Email**:
   - **Confirm email: LIGADO** (em produção, sempre).
   - Mínimo de senha: 8 ou mais.
5. **Authentication → URL Configuration**:
   - **Site URL:** a URL final do app (ex.: `https://app.seudominio.com.br`). Faça depois do passo 3.
   - **Redirect URLs:** a mesma URL com `/**` no fim.
6. **E-mail transacional (obrigatório para produção).** O e-mail padrão do Supabase aceita só poucos e-mails por hora, o que trava o cadastro de clientes.
   - Crie conta em **resend.com** (ou outro provedor SMTP), verifique seu domínio (registros DNS que eles mostram) e gere uma chave.
   - Supabase → **Authentication → Emails → SMTP Settings → Enable custom SMTP**: host `smtp.resend.com`, porta `465`, usuário `resend`, senha = a chave, remetente `nao-responda@seudominio.com.br`.
   - Em **Authentication → Emails** edite os modelos de e-mail para português (assunto e texto de "Confirmar cadastro" e "Redefinir senha").
7. **Project Settings → API:** anote a **Project URL** e a **publishable key** (`sb_publishable_…`). **Nunca** use a `service_role` no app.

## 2. Código no GitHub

```bash
cd C:\Users\victo\Apps\AltumCRM
git remote add origin https://github.com/SEU-USUARIO/altum-crm.git   # crie o repositório PRIVADO antes
git push -u origin main
```

O `.env.local` não vai junto (está no `.gitignore`).

## 3. Hospedagem (Vercel)

1. vercel.com → **Add New → Project** → importe o repositório `altum-crm`.
2. **Environment Variables** (Production):

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do projeto **de produção** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key do projeto **de produção** |
| `NEXT_PUBLIC_COMPANY_NAME` | Razão social que aparece em Termos e Privacidade |
| `NEXT_PUBLIC_COMPANY_CNPJ` | (opcional) CNPJ |
| `NEXT_PUBLIC_PRIVACY_EMAIL` | E-mail para pedidos de LGPD |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | E-mail de suporte (aparece em Ajuda) |

3. **Deploy.** A Vercel gera uma URL `*.vercel.app`.
4. **Domínio próprio:** Project → **Settings → Domains → Add** (`app.seudominio.com.br`), crie no seu DNS o registro que ela indicar (CNAME) e espere o certificado HTTPS ficar ativo.
5. Volte ao Supabase (passo 1.5) e coloque a URL final em **Site URL** e **Redirect URLs**.
6. Em **Settings → Git**, deixe a branch `main` como Production. Cada `push` publica sozinho, e cada pull request ganha uma prévia.

## 4. Conferência depois de publicar

Faça no site publicado, com e-mails reais:

- [ ] Criar conta → chega o e-mail de confirmação → confirmar → entrar.
- [ ] Criar organização, cadastrar um contato, criar um negócio, arrastar entre etapas.
- [ ] Convidar um segundo e-mail pelo link, aceitar em outro navegador, ver que o vendedor não enxerga a aba Funis/Auditoria em Administração.
- [ ] Trocar o tema, instalar como app no celular (menu do navegador → "Adicionar à tela inicial").
- [ ] Abrir `/termos` e `/privacidade` e conferir o nome da empresa.
- [ ] Definir a meta mensal em Administração → Organização.

## 5. Rotina

- **Backups:** Supabase gratuito não faz backup diário restaurável. No plano **Pro** há backups diários; antes de ter clientes pagantes, assine. Até lá, peça aos clientes que usem **Contatos → Exportar** periodicamente.
- **Atualizações:** `npm run lint && npm run typecheck && npm test && npm run build` antes de cada `push` (o GitHub Actions já faz isso nas pull requests).
- **Mudanças no banco:** crie uma migração nova em `supabase/migrations/` com testes, rode `npm test`, cole no SQL Editor de **desenvolvimento**, teste, e só então em **produção**.
- **Chaves:** se uma chave vazar, gere outra em Supabase → Project Settings → API e atualize na Vercel.

## 6. Antes de cobrar clientes

Veja a lista em [SEGURANCA.md](SEGURANCA.md#antes-de-vender): revisão jurídica dos Termos e da Privacidade, plano Pro do Supabase, SMTP próprio e cobrança (Stripe/Asaas), que ainda não está implementada.
