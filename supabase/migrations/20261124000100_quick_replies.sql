-- Respostas rápidas: textos prontos que o atendente insere na conversa digitando "/atalho".
-- Toda a equipe usa; só administrador e gerente cadastram, editam e apagam (biblioteca da empresa).
-- Variáveis aceitas no texto: {{nome}} e {{primeiro_nome}} (preenchidas na hora de inserir).

create table public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  shortcut text not null check (shortcut ~ '^[a-z0-9_-]{1,30}$'),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 4096),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index quick_replies_shortcut_uniq on public.quick_replies (org_id, shortcut);
create trigger quick_replies_updated_at before update on public.quick_replies
  for each row execute function public.set_updated_at();
create trigger audit_quick_replies after insert or update or delete on public.quick_replies
  for each row execute function public.audit_row();

alter table public.quick_replies enable row level security;
create policy quick_replies_select on public.quick_replies for select to authenticated using (public.is_org_member(org_id));
create policy quick_replies_insert on public.quick_replies for insert to authenticated
  with check (public.is_org_manager(org_id) and created_by = auth.uid());
create policy quick_replies_update on public.quick_replies for update to authenticated
  using (public.is_org_manager(org_id)) with check (public.is_org_manager(org_id));
create policy quick_replies_delete on public.quick_replies for delete to authenticated using (public.is_org_manager(org_id));

revoke all on public.quick_replies from anon, authenticated;
grant select on public.quick_replies to authenticated;
grant insert (org_id, shortcut, title, body, created_by) on public.quick_replies to authenticated;
grant update (shortcut, title, body) on public.quick_replies to authenticated;
grant delete on public.quick_replies to authenticated;
