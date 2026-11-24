-- Altum CRM: migrações 7 a 10 (tempo real, respostas rápidas, contatos com telefone único/etiquetas/campos, WhatsApp pelo app da Agência).
-- Cole TUDO no SQL Editor do Supabase e clique em Run. Pré-requisito: migrações 1 a 6 já aplicadas.
-- ATENÇÃO: junta automaticamente contatos duplicados pelo telefone no mais antigo (nada é perdido).

-- ===== 20261124000000_realtime.sql =====
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

-- ===== 20261124000100_quick_replies.sql =====
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

-- ===== 20261124000200_contacts_tags_fields.sql =====
-- Contatos: telefone único (com junção automática dos duplicados), etiquetas e campos personalizados.
--
-- 1. Chave de telefone: DDI + DDD + últimos 8 dígitos no Brasil, para o mesmo celular com e sem o 9
--    (o WhatsApp às vezes manda sem) virar a mesma pessoa. Fora do Brasil, só os dígitos com DDI.
-- 2. Duplicados existentes são JUNTADOS no contato mais antigo: negócios, tarefas, atividades e conversas
--    passam para ele, campos vazios são preenchidos com os dos duplicados e o que não couber (outro e-mail,
--    outro telefone, observações) vai para as observações. Nada é perdido.
-- 3. Índice único impede duplicado novo em qualquer caminho (tela, importação, conversa).
-- 4. Etiquetas (tags) e campos personalizados por organização.

-- ---------------------------------------------------------------- 1. chave de telefone
create function public.phone_key(p text) returns text
language plpgsql immutable parallel safe set search_path = public as $$
declare
  raw text := btrim(coalesce(p, ''));
  d text := regexp_replace(raw, '\D', '', 'g');
  explicit boolean := left(raw, 1) = '+' or left(d, 2) = '00';
begin
  if left(d, 2) = '00' then d := substr(d, 3); end if;
  if not explicit and char_length(d) in (10, 11) then d := '55' || d; end if;
  if d !~ '^[0-9]{8,15}$' then return null; end if;
  if d ~ '^55[0-9]{10,11}$' then return '55' || substr(d, 3, 2) || right(d, 8); end if;
  return d;
end;
$$;
grant execute on function public.phone_key(text) to authenticated;

alter table public.contacts add column phone_key text generated always as (public.phone_key(phone)) stored;

-- ---------------------------------------------------------------- 2. junção dos duplicados
do $$
declare
  g record;
  keeper public.contacts;
  dup public.contacts;
  extra text;
begin
  for g in
    select org_id, phone_key, array_agg(id order by created_at, id) as ids
    from public.contacts where phone_key is not null
    group by org_id, phone_key having count(*) > 1
  loop
    select * into keeper from public.contacts where id = g.ids[1];
    extra := '';
    for dup in select * from public.contacts where id = any (g.ids[2:]) order by created_at, id loop
      update public.deals set contact_id = keeper.id where contact_id = dup.id;
      update public.tasks set contact_id = keeper.id where contact_id = dup.id;
      update public.activities set contact_id = keeper.id where contact_id = dup.id;
      update public.conversations set contact_id = keeper.id where contact_id = dup.id;

      -- campos vazios do mais antigo recebem os do duplicado; o que já estiver preenchido e for diferente vai para as observações
      if keeper.email is null then keeper.email := dup.email;
      elsif dup.email is not null and lower(dup.email) <> lower(keeper.email) then extra := extra || E'\nOutro e-mail: ' || dup.email; end if;
      if dup.phone is not null and dup.phone <> coalesce(keeper.phone, '') then extra := extra || E'\nOutro telefone: ' || dup.phone; end if;
      keeper.job_title := coalesce(keeper.job_title, dup.job_title);
      keeper.company_id := coalesce(keeper.company_id, dup.company_id);
      keeper.owner_id := coalesce(keeper.owner_id, dup.owner_id);
      keeper.source := coalesce(keeper.source, dup.source);
      if dup.name <> keeper.name then extra := extra || E'\nTambém cadastrado como: ' || dup.name; end if;
      if dup.notes is not null then extra := extra || E'\n' || dup.notes; end if;

      delete from public.contacts where id = dup.id; -- antes de copiar o e-mail, por causa do índice único de e-mail
    end loop;

    update public.contacts set
      email = keeper.email,
      job_title = keeper.job_title,
      company_id = keeper.company_id,
      owner_id = keeper.owner_id,
      source = keeper.source,
      notes = left(nullif(btrim(coalesce(keeper.notes, '') || case when extra <> '' then E'\n\n[Unificado automaticamente por telefone]' || extra else '' end), ''), 5000)
    where id = keeper.id;
  end loop;
end
$$;

-- ---------------------------------------------------------------- 3. unicidade
create unique index contacts_phone_uniq on public.contacts (org_id, phone_key) where phone_key is not null;

-- Contato novo (ou telefone alterado) é ligado às conversas do mesmo número que ainda não tinham contato.
create function public.contacts_link_conversations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_key is not null and (tg_op = 'INSERT' or new.phone_key is distinct from old.phone_key) then
    update public.conversations set contact_id = new.id
    where org_id = new.org_id and contact_id is null and public.phone_key(phone) = new.phone_key;
  end if;
  return null;
end;
$$;
revoke execute on function public.contacts_link_conversations() from public, anon, authenticated;
create trigger contacts_link_conversations after insert or update of phone on public.contacts
  for each row execute function public.contacts_link_conversations();

-- Mensagem recebida: procura o contato pela chave de telefone (pega o celular com e sem o 9).
create or replace function public.wa_ingest(p_key text, p_channel uuid, p_phone text, p_name text, p_body text, p_external_id text, p_at timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ch public.whatsapp_channels;
  conv public.conversations;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_contact uuid;
begin
  if not public.internal_ok(p_key) then raise exception 'Não autorizado' using errcode = '42501'; end if;
  if v_phone !~ '^[0-9]{6,20}$' then raise exception 'Telefone inválido' using errcode = 'P0001'; end if;
  select * into ch from public.whatsapp_channels where id = p_channel;
  if not found then raise exception 'Canal não encontrado' using errcode = 'P0002'; end if;

  select * into conv from public.conversations where channel_id = p_channel and phone = v_phone;
  if not found then
    select id into v_contact from public.contacts
    where org_id = ch.org_id and phone_key = public.phone_key('+' || v_phone)
    order by created_at limit 1;
    insert into public.conversations (org_id, channel_id, phone, display_name, contact_id)
    values (ch.org_id, p_channel, v_phone, nullif(left(btrim(coalesce(p_name, '')), 120), ''), v_contact)
    returning * into conv;
  else
    if p_external_id is not null and exists (select 1 from public.messages where conversation_id = conv.id and external_id = p_external_id) then
      return null;
    end if;
    if coalesce(conv.display_name, '') = '' and btrim(coalesce(p_name, '')) <> '' then
      update public.conversations set display_name = left(btrim(p_name), 120) where id = conv.id;
    end if;
  end if;

  insert into public.messages (org_id, conversation_id, direction, body, status, external_id, created_at)
  values (ch.org_id, conv.id, 'in', left(coalesce(nullif(btrim(p_body), ''), '[mensagem sem texto]'), 4096), 'received', p_external_id, coalesce(p_at, now()));
  return conv.id;
end;
$$;

-- ---------------------------------------------------------------- 4a. etiquetas
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default 'gray' check (color in ('gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index tags_name_uniq on public.tags (org_id, lower(btrim(name)));

create table public.contact_tags (
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id),
  foreign key (org_id, contact_id) references public.contacts (org_id, id) on delete cascade,
  foreign key (org_id, tag_id) references public.tags (org_id, id) on delete cascade
);
create index contact_tags_tag_idx on public.contact_tags (org_id, tag_id);

-- ---------------------------------------------------------------- 4b. campos personalizados
create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  kind text not null check (kind in ('text', 'number', 'date', 'select')),
  options text[] not null default '{}' check (
    (kind = 'select' and cardinality(options) between 1 and 30) or (kind <> 'select' and cardinality(options) = 0)
  ),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index custom_fields_label_uniq on public.custom_fields (org_id, lower(btrim(label)));

create table public.contact_field_values (
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null,
  field_id uuid not null,
  value text not null check (char_length(btrim(value)) between 1 and 1000),
  updated_at timestamptz not null default now(),
  primary key (contact_id, field_id),
  foreign key (org_id, contact_id) references public.contacts (org_id, id) on delete cascade,
  foreign key (org_id, field_id) references public.custom_fields (org_id, id) on delete cascade
);

-- O valor precisa combinar com o tipo do campo (número, data AAAA-MM-DD ou uma das opções).
create function public.contact_field_values_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f public.custom_fields;
begin
  select * into f from public.custom_fields where id = new.field_id;
  if f.kind = 'number' and new.value !~ '^-?[0-9]+([.,][0-9]+)?$' then
    raise exception 'Valor precisa ser um número' using errcode = '22023';
  elsif f.kind = 'date' then
    if new.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data inválida' using errcode = '22023'; end if;
    perform new.value::date; -- recusa 2026-02-31
  elsif f.kind = 'select' and not (new.value = any (f.options)) then
    raise exception 'Opção inválida' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.contact_field_values_check() from public, anon, authenticated;
create trigger contact_field_values_check before insert or update on public.contact_field_values
  for each row execute function public.contact_field_values_check();

-- ---------------------------------------------------------------- auditoria
create trigger audit_tags after insert or update or delete on public.tags for each row execute function public.audit_row();
create trigger audit_custom_fields after insert or update or delete on public.custom_fields for each row execute function public.audit_row();

-- ---------------------------------------------------------------- RLS e permissões
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.custom_fields enable row level security;
alter table public.contact_field_values enable row level security;

-- etiquetas: qualquer membro cria e aplica; renomear, mudar cor e apagar é de gerente ou administrador
create policy tags_select on public.tags for select to authenticated using (public.is_org_member(org_id));
create policy tags_insert on public.tags for insert to authenticated with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy tags_update on public.tags for update to authenticated using (public.is_org_manager(org_id)) with check (public.is_org_manager(org_id));
create policy tags_delete on public.tags for delete to authenticated using (public.is_org_manager(org_id));

create policy contact_tags_select on public.contact_tags for select to authenticated using (public.is_org_member(org_id));
create policy contact_tags_insert on public.contact_tags for insert to authenticated with check (public.is_org_member(org_id));
create policy contact_tags_delete on public.contact_tags for delete to authenticated using (public.is_org_member(org_id));

-- campos: só o administrador define a estrutura; a equipe preenche os valores
create policy custom_fields_select on public.custom_fields for select to authenticated using (public.is_org_member(org_id));
create policy custom_fields_insert on public.custom_fields for insert to authenticated with check (public.is_org_admin(org_id));
create policy custom_fields_update on public.custom_fields for update to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy custom_fields_delete on public.custom_fields for delete to authenticated using (public.is_org_admin(org_id));

create policy contact_field_values_select on public.contact_field_values for select to authenticated using (public.is_org_member(org_id));
create policy contact_field_values_insert on public.contact_field_values for insert to authenticated with check (public.is_org_member(org_id));
create policy contact_field_values_update on public.contact_field_values for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy contact_field_values_delete on public.contact_field_values for delete to authenticated using (public.is_org_member(org_id));

revoke all on public.tags, public.contact_tags, public.custom_fields, public.contact_field_values from anon, authenticated;
grant select on public.tags, public.contact_tags, public.custom_fields, public.contact_field_values to authenticated;
grant insert (org_id, name, color, created_by) on public.tags to authenticated;
grant update (name, color) on public.tags to authenticated;
grant delete on public.tags to authenticated;
grant insert (org_id, contact_id, tag_id) on public.contact_tags to authenticated;
grant delete on public.contact_tags to authenticated;
grant insert (org_id, label, kind, options, position) on public.custom_fields to authenticated;
grant update (label, options, position) on public.custom_fields to authenticated;
grant delete on public.custom_fields to authenticated;
grant insert (org_id, contact_id, field_id, value) on public.contact_field_values to authenticated;
grant update (value) on public.contact_field_values to authenticated;
grant delete on public.contact_field_values to authenticated;

-- ===== 20261124000300_whatsapp_meta_app.sql =====
-- WhatsApp pelo app da Meta da Agência (modelo do wacrm).
--
-- Um único app da Meta, com um único webhook (/api/whatsapp/webhook), atende todas as organizações.
-- A Meta manda o phone_number_id em cada aviso; o servidor usa isso para achar o canal certo.
-- Por isso cada número só pode estar ligado a UMA organização do Altum.

do $$
declare
  dup text;
begin
  select string_agg(external_id, ', ') into dup from (
    select external_id from public.whatsapp_channels
    where provider = 'cloud' and external_id is not null
    group by external_id having count(*) > 1
  ) d;
  if dup is not null then
    raise exception 'Há canais da API oficial repetidos para o(s) número(s): %. Apague o canal sobrando em WhatsApp e rode esta migração de novo.', dup
      using errcode = 'P0001';
  end if;
end
$$;

create unique index whatsapp_channels_cloud_number_uniq on public.whatsapp_channels (external_id)
  where provider = 'cloud' and external_id is not null;

-- Webhook único: phone_number_id → canal. Só o servidor (com a chave interna) consulta.
create function public.wa_channel_by_number(p_key text, p_phone_number_id text) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.internal_ok(p_key) then raise exception 'Não autorizado' using errcode = '42501'; end if;
  return (select id from public.whatsapp_channels where provider = 'cloud' and external_id = p_phone_number_id);
end;
$$;
revoke execute on function public.wa_channel_by_number(text, text) from public, anon, authenticated;
grant execute on function public.wa_channel_by_number(text, text) to anon, authenticated;

