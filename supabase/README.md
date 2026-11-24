# Banco de dados (Supabase)

## Migrações (em ordem)

| Arquivo | Conteúdo |
|---|---|
| `20261116000000_auth_orgs.sql` | Perfis, organizações, membros, convites, RLS e funções de criar organização / aceitar convite |
| `20261116000100_profiles_email.sql` | E-mail no perfil (lista de usuários) |
| `20261116000200_contacts.sql` | Empresas e contatos |
| `20261116000300_crm_core.sql` | Funis, etapas, negócios, tarefas, atividades, notificações, auditoria, meta mensal e indicadores da Central |
| `20261117000000_atendimento.sql` | Canais de WhatsApp, conversas, mensagens, suporte interno (chamados) |
| `20261117000100_analytics.sql` | Indicadores da tela Análises |
| `20261124000000_realtime.sql` | Tempo real: conversas, mensagens e notificações avisam a tela assim que mudam |
| `20261124000100_quick_replies.sql` | Respostas rápidas (atalhos / nas Conversas), com auditoria |
| `20261124000200_contacts_tags_fields.sql` | Telefone único (junta duplicados automaticamente), etiquetas e campos personalizados nos contatos |
| `20261124000300_whatsapp_meta_app.sql` | WhatsApp pelo app da Meta da Agência: webhook único e um número por organização |

## Projeto novo (ex.: produção)

```bash
npm run db:bundle
```

Abra `supabase/schema-completo.sql`, copie tudo e cole em **SQL Editor → New query → Run** no projeto novo. Não rode em um projeto que já tem as migrações.

## Projeto que já existe

Cole **somente** as migrações que ainda não foram aplicadas, na ordem da tabela acima.

## Testes

`npm test` aplica todas as migrações num Postgres embutido (PGlite) com um stub do schema `auth` do Supabase e prova, com SQL real, o isolamento entre organizações, os papéis e as regras de negócio. **Toda migração nova deve vir com testes** em `supabase/tests/`.

## Regras ao escrever migrações

1. Toda tabela de dados tem `org_id` e RLS ligada.
2. Vínculos entre tabelas da mesma organização usam chave estrangeira **composta** `(org_id, id)`.
3. Conceda só as colunas necessárias (`grant insert (...)`, `grant update (...)`); nunca `grant all`.
4. Funções `security definer` sempre com `set search_path = public` e `revoke execute ... from public, anon`.
5. Escritas sensíveis (criar organização, aceitar convite) passam por função, não por `insert` direto.
