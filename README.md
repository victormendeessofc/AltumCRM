# Altum CRM

CRM para times comerciais: **funis de vendas** (kanban), **contatos e empresas**, **tarefas**, **Central** com indicadores reais, convites e papéis de equipe, notificações, busca global (Ctrl+K) e auditoria. Multi-organização com isolamento de dados garantido no banco.

- **Front/back:** Next.js 16 (App Router, Server Actions), TypeScript, Tailwind 4
- **Banco e login:** Supabase (Postgres + Auth), com RLS em todas as tabelas
- **Hospedagem:** Vercel
- **Idioma/fuso:** português do Brasil, horário de Brasília

## Rodando localmente

```bash
npm install
cp .env.example .env.local      # preencha a URL e a chave publishable do Supabase
npm run dev                     # http://localhost:3000
```

O banco precisa das migrações aplicadas: veja [supabase/README.md](supabase/README.md).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (rode `npx next typegen` antes em clone novo) |
| `npm test` | Testes unitários **e** testes de segurança do banco (SQL real em Postgres embutido) |
| `npm run e2e [auth\|contacts\|admin\|crm]` | Testes de ponta a ponta num Chrome real, contra o Supabase do `.env.local` (rode `npm start -- -p 3100` em outro terminal) |
| `npm run db:bundle` | Gera `supabase/schema-completo.sql` (todas as migrações, para um projeto novo) |

## Estrutura

```
src/app/(auth)      entrar, cadastro, onboarding
src/app/(app)       Central, funis, contatos, tarefas, admin, perfil, ajuda (exigem login e organização)
src/app/(legal)     termos e privacidade (públicas)
src/app/convite     aceitar convite por link
src/components      ui/ (design system), shell/, deals/, contacts/, tasks/, admin/, profile/
src/lib             regras puras (dinheiro, datas, CSV, validação) + Server Actions (*-actions.ts)
supabase/migrations esquema, políticas de segurança (RLS), funções e gatilhos
supabase/tests      testes que provam o isolamento entre organizações
e2e/                testes de ponta a ponta
docs/               deploy, segurança e manual do usuário
```

## Como a segurança funciona (resumo)

Toda tabela tem `org_id`; o Postgres só devolve linhas de organizações das quais a pessoa é membro (RLS). Chaves estrangeiras compostas impedem ligar dados de organizações diferentes. Papéis (administrador, gerente, vendedor) são aplicados **no banco**, não só na tela. Detalhes e checklist em [docs/SEGURANCA.md](docs/SEGURANCA.md).

## Publicar

Passo a passo em [docs/DEPLOY.md](docs/DEPLOY.md). Manual para quem usa o sistema: [docs/MANUAL-DO-USUARIO.md](docs/MANUAL-DO-USUARIO.md).

## Fora do escopo atual

Conversas/WhatsApp, Assistente de IA, emissão de NF-e, webhooks, integrações e cobrança estão planejados para fases seguintes (aparecem como "em breve" no menu).
