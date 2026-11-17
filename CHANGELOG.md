# Changelog

## 1.1.0 — 17/11/2026

**Organizações**
- Seletor de organização: quem participa de mais de uma troca entre elas (cada uma com o seu papel). Ao aceitar um convite, a organização do convite vira a ativa
- Correção: o link de confirmação de e-mail agora volta ao convite (antes caía numa conta zerada)

**Atendimento** (guia em `docs/ATENDIMENTO.md`)
- WhatsApp: conexão pela API oficial (Meta) ou por QR Code (servidor Evolution API próprio)
- Conversas: caixa de entrada compartilhada, responsável, status, criar contato, nova conversa
- Suporte interno: chamados do time com comentários, prioridade e responsável
- Segredos dos canais protegidos no banco; webhooks protegidos por segredo, assinatura e chave interna

**Análises**
- Receita por mês, conversão, ticket médio, ciclo de venda, funil, desempenho por responsável, motivos de perda, origem dos negócios, tempo de resposta

**Banco:** migrações 5 (atendimento) e 6 (análises). Arquivo para aplicar em produção: `supabase/aplicar-migracoes-5-e-6.sql`

## 1.0.0 — 16/11/2026

Primeira versão completa do núcleo do CRM.

**Acesso e equipe**
- Cadastro, login, sair, recuperação de senha por e-mail, redefinição de senha
- Organizações com isolamento total de dados (RLS), papéis (administrador, gerente, vendedor)
- Convites por link (7 dias, uso único, só para o e-mail convidado)

**Comercial**
- Contatos e empresas: busca, criar/editar/excluir, importar e exportar CSV
- Funis de vendas: kanban com arrastar e soltar (mouse, toque e teclado), visão em lista, filtros, motivo de perda, histórico por negócio
- Editor de funis e etapas (nome, ordem, probabilidade)
- Tarefas por prazo (hoje, atrasadas, próximas), vínculo com negócio e contato

**Gestão**
- Central com meta mensal, pipeline, ponderado, negócios parados, tarefas, ranking e atividade recente
- Notificações de atribuição, busca global (Ctrl+K), auditoria de ações
- Perfil (nome, senha, tema claro/escuro/sistema), Ajuda, Termos e Privacidade (LGPD)
- Exclusão da organização com confirmação

**Qualidade**
- 108 testes automatizados (65 deles de segurança do banco, validados com testes de mutação)
- Testes de ponta a ponta (login, contatos, administração, núcleo do CRM)
- Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options…), PWA instalável, CI no GitHub Actions

**Próximas fases:** WhatsApp/Conversas, Assistente de IA, integrações (NF-e, webhooks, agenda), gamificação, cobrança.
