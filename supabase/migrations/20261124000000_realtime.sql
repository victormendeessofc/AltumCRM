-- Tempo real (Supabase Realtime): conversas, mensagens e notificações passam a avisar a tela
-- assim que mudam, em vez de a tela perguntar a cada poucos segundos.
--
-- Segurança: o Realtime do Supabase aplica as mesmas políticas de RLS de SELECT a cada assinante.
-- Quem não pode ler a linha pela API também não recebe o evento. Nada muda nas permissões.
--
-- Idempotente: pode rodar de novo sem erro.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['conversations', 'messages', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
