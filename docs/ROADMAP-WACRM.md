# Plano: o que trazer do wacrm para o Altum

Referência: [ArnasDon/wacrm](https://github.com/ArnasDon/wacrm) (MIT, Next.js + Supabase), clonado em `C:\Users\victo\Apps\_referencias\wacrm`. Análise feita em 2026-11-24.

Licença MIT: pode copiar e vender, **mantendo o aviso de copyright** nos arquivos copiados ou adaptados de lá.

## Ordem combinada

| # | Item | Status |
|---|---|---|
| 1 | Tempo real (Supabase Realtime) em conversas, mensagens e notificações | Feito, local (migração `20261124000000_realtime.sql`) |
| 4 | Respostas rápidas (/atalho, variáveis {{nome}} e {{primeiro_nome}}, aba em Administração) | Feito, local (migração `20261124000100_quick_replies.sql`) |
| W | Conexão do WhatsApp no modelo wacrm: app da Meta da Agência, webhook único, verificar → conferir WABA → registrar com PIN → inscrever, erros com etapa/código/trace, Reconectar | Feito, local (migração `20261124000300_whatsapp_meta_app.sql`) |
| 5 | Telefone único (junção automática decidida pelo Victor em 2026-11-24), etiquetas e campos personalizados | Banco feito e testado (migração `20261124000200`); **faltam as telas** (etiquetas e campos no contato, filtro por etiqueta, aba de gestão, importação pulando telefone repetido) |
| 2 | Mídias: enviar/receber imagem, áudio, documento; gravar áudio; cópia no Storage | A fazer |
| 3 | Modelos de mensagem da Meta (criar, sincronizar, enviar) | A fazer |
| 8 | Assistente de IA: rascunho, resposta automática, base de conhecimento, passagem para humano, log de tokens | Depois |
| 9 | Automações sem código (8 gatilhos, 13 ações, 4 modelos prontos) | Depois |
| 10 | Disparos em massa (público por tag/campo/CSV, retomada) | Depois |
| 11 | Painel de atendimento (fila, janelas 24 h, falhas, tempo por atendente) | Depois |
| 12-14 | API pública com escopos, webhooks de saída assinados (com proteção SSRF), servidor MCP | Depois |
| 15 | Fluxos (chatbot com botões e listas) | Depois |
| 7 | Responder citando, reações, "digitando…", motivo de falha | Polimento |

## Cuidados ao portar

1. **Segurança:** o wacrm usa a chave `service_role` nos motores. O Altum não usa: toda operação privilegiada vira função `security definer` exigindo a `ALTUM_INTERNAL_KEY`, e o RLS continua valendo.
2. **Limite de uso em memória:** na Vercel funciona só em parte (cada instância conta separado). Aceitável para teste com poucos clientes. Antes de vender em escala, trocar por limite no Postgres. O limite de respostas da IA por conversa fica no banco (atômico), então não depende disso.
3. **Tarefas agendadas (ESTACIONADO, decisão de 2026-11-24):** "esperar X tempo" nas automações e o tempo limite dos fluxos precisam de cron. O plano Hobby da Vercel só roda cron 1x por dia. Opções quando for a hora: plano Pro da Vercel, `pg_cron` no próprio Supabase chamando uma rota, ou cron externo (ex.: cron-job.org) chamando uma rota protegida por segredo. Por enquanto, automações saem **sem passos de espera**.
4. **Modelos de dados diferentes** (`account_id` × `org_id`, `content_text` × `body`): adaptar, não copiar direto. Cada parte portada ganha teste.
5. Modelo de IA padrão do wacrm está desatualizado: usar um atual.
