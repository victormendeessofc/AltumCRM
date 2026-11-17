-- Altum CRM - migracoes 5 e 6 (Atendimento e Analises).
-- Para um banco que JA tem as migracoes 1 a 4 (producao). Cole TUDO no SQL Editor e clique em Run.
-- Nao rode em um projeto novo e vazio: la use o schema-completo.sql.

-- ==== 20261117000000_atendimento.sql ====
-- Altum CRM — migração 5: Atendimento (canais de WhatsApp, conversas, mensagens e suporte interno).
-- Mesmos princípios das anteriores: tudo tem org_id, chaves estrangeiras compostas impedem cruzar organizações
-- e a RLS limita o acesso a quem é membro. Segredos (token da API, chave do servidor) ficam numa tabela SEM
-- nenhum acesso direto: só funções específicas leem ou gravam, e as de servidor exigem a "chave interna".

-- ---------------------------------------------------------------- chave interna (servidor → banco)
-- Webhooks do WhatsApp chegam sem usuário logado. Para gravar mensagens sem usar a service_role, o servidor
-- do app envia uma chave secreta (variável ALTUM_INTERNAL_KEY na Vercel) e o banco compara com o hash guardado aqui.
create table public.internal_config (
  key text primary key,
  value text not null
);
alter table public.internal_config enable row level security;
revoke all on public.internal_config from anon, authenticated;

create function public.set_internal_key(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_key, '')) < 32 then
    raise exception 'A chave interna precisa ter pelo menos 32 caracteres' using errcode = 'P0001';
  end if;
  insert into public.internal_config (key, value)
  values ('internal_key_hash', encode(sha256(convert_to(p_key, 'utf8')), 'hex'))
  on conflict (key) do update set value = excluded.value;
end;
$$;

create function public.internal_ok(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.internal_config
    where key = 'internal_key_hash' and value = encode(sha256(convert_to(coalesce(p_key, ''), 'utf8')), 'hex')
  );
$$;

-- ---------------------------------------------------------------- canais de WhatsApp
create table public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('cloud', 'qr')),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  phone text check (phone is null or char_length(phone) <= 30),
  external_id text check (external_id is null or char_length(external_id) <= 120),
  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'connected', 'error')),
  status_detail text check (status_detail is null or char_length(status_detail) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create index whatsapp_channels_org_idx on public.whatsapp_channels (org_id);

-- Segredos do canal (token da API oficial, chave do servidor de QR Code, segredo do webhook). Sem acesso direto.
create table public.channel_secrets (
  channel_id uuid primary key references public.whatsapp_channels (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.channel_secrets enable row level security;
revoke all on public.channel_secrets from anon, authenticated;

-- ---------------------------------------------------------------- conversas e mensagens
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  channel_id uuid not null,
  phone text not null check (phone ~ '^[0-9]{6,20}$'),
  display_name text check (display_name is null or char_length(display_name) <= 120),
  contact_id uuid,
  assignee_id uuid,
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  unread_count int not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_message_preview text check (last_message_preview is null or char_length(last_message_preview) <= 200),
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (channel_id, phone),
  foreign key (org_id, channel_id) references public.whatsapp_channels (org_id, id) on delete cascade,
  foreign key (org_id, contact_id) references public.contacts (org_id, id) on delete set null (contact_id),
  foreign key (org_id, assignee_id) references public.memberships (org_id, user_id) on delete set null (assignee_id)
);
create index conversations_inbox_idx on public.conversations (org_id, status, last_message_at desc);
create index conversations_assignee_idx on public.conversations (org_id, assignee_id);
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  body text not null check (char_length(body) between 1 and 4096),
  status text not null default 'received' check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  external_id text check (external_id is null or char_length(external_id) <= 200),
  error text check (error is null or char_length(error) <= 300),
  sender_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (org_id, conversation_id) references public.conversations (org_id, id) on delete cascade
);
create index messages_thread_idx on public.messages (conversation_id, created_at);
create unique index messages_external_uniq on public.messages (conversation_id, external_id) where external_id is not null;

-- Atualiza a conversa a cada mensagem nova e avisa o responsável quando chega algo do cliente.
create function public.messages_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_assignee uuid;
  v_name text;
begin
  update public.conversations c set
    last_message_at = new.created_at,
    last_message_preview = left(new.body, 120),
    unread_count = case when new.direction = 'in' then c.unread_count + 1 else 0 end,
    last_inbound_at = case when new.direction = 'in' then new.created_at else c.last_inbound_at end,
    status = case when new.direction = 'in' and c.status = 'closed' then 'open' else c.status end
  where c.id = new.conversation_id
  returning c.assignee_id, coalesce(nullif(c.display_name, ''), c.phone) into v_assignee, v_name;

  if new.direction = 'in' and v_assignee is not null then
    insert into public.notifications (org_id, user_id, kind, title, body, link)
    values (new.org_id, v_assignee, 'message_in', 'Nova mensagem de ' || v_name, left(new.body, 120), '/conversas?c=' || new.conversation_id);
  end if;
  return null;
end;
$$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.messages_after_insert();

-- ---------------------------------------------------------------- suporte interno (chamados do time)
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text check (body is null or char_length(body) <= 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  requester_id uuid references auth.users (id) on delete set null,
  assignee_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, assignee_id) references public.memberships (org_id, user_id) on delete set null (assignee_id)
);
create index tickets_org_status_idx on public.tickets (org_id, status, created_at desc);

create function public.tickets_before_write() returns trigger language plpgsql as $$
begin
  if new.status = 'resolved' then
    if tg_op = 'INSERT' or old.status is distinct from 'resolved' then new.resolved_at = now(); end if;
  else
    new.resolved_at = null;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger tickets_before_write before insert or update on public.tickets
  for each row execute function public.tickets_before_write();

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  ticket_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (org_id, ticket_id) references public.tickets (org_id, id) on delete cascade
);
create index ticket_comments_idx on public.ticket_comments (ticket_id, created_at);

create function public.notify_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null
     and new.assignee_id is distinct from (case when tg_op = 'UPDATE' then old.assignee_id end)
     and new.assignee_id is distinct from auth.uid() then
    insert into public.notifications (org_id, user_id, kind, title, body, link)
    values (new.org_id, new.assignee_id, 'ticket_assigned', 'Chamado atribuído a você', left(new.title, 120), '/suporte?t=' || new.id);
  end if;
  return null;
end;
$$;
create trigger tickets_notify after insert or update of assignee_id on public.tickets
  for each row execute function public.notify_ticket();

-- ---------------------------------------------------------------- auditoria
create trigger audit_whatsapp_channels after insert or update or delete on public.whatsapp_channels for each row execute function public.audit_row();
create trigger audit_tickets after insert or update or delete on public.tickets for each row execute function public.audit_row();

-- ---------------------------------------------------------------- RLS
alter table public.whatsapp_channels enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;

create policy whatsapp_channels_select on public.whatsapp_channels for select to authenticated using (public.is_org_member(org_id));
create policy whatsapp_channels_update on public.whatsapp_channels for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy whatsapp_channels_delete on public.whatsapp_channels for delete to authenticated using (public.is_org_admin(org_id));

create policy conversations_select on public.conversations for select to authenticated using (public.is_org_member(org_id));
create policy conversations_update on public.conversations for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy conversations_delete on public.conversations for delete to authenticated using (public.is_org_manager(org_id));

create policy messages_select on public.messages for select to authenticated using (public.is_org_member(org_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_org_member(org_id) and direction = 'out' and status = 'queued' and sender_id = auth.uid());

create policy tickets_select on public.tickets for select to authenticated using (public.is_org_member(org_id));
create policy tickets_insert on public.tickets for insert to authenticated
  with check (public.is_org_member(org_id) and requester_id = auth.uid());
create policy tickets_update on public.tickets for update to authenticated
  using (public.is_org_manager(org_id) or requester_id = auth.uid() or assignee_id = auth.uid())
  with check (public.is_org_member(org_id));
create policy tickets_delete on public.tickets for delete to authenticated
  using (public.is_org_manager(org_id) or requester_id = auth.uid());

create policy ticket_comments_select on public.ticket_comments for select to authenticated using (public.is_org_member(org_id));
create policy ticket_comments_insert on public.ticket_comments for insert to authenticated
  with check (public.is_org_member(org_id) and author_id = auth.uid());
create policy ticket_comments_delete on public.ticket_comments for delete to authenticated
  using (public.is_org_manager(org_id) or author_id = auth.uid());

-- ---------------------------------------------------------------- permissões (privilégio mínimo)
revoke all on public.whatsapp_channels, public.conversations, public.messages, public.tickets, public.ticket_comments from anon, authenticated;
grant select on public.whatsapp_channels, public.conversations, public.messages, public.tickets, public.ticket_comments to authenticated;
grant update (name) on public.whatsapp_channels to authenticated;
grant delete on public.whatsapp_channels to authenticated;
grant update (status, assignee_id, contact_id, unread_count) on public.conversations to authenticated;
grant delete on public.conversations to authenticated;
grant insert (org_id, conversation_id, direction, body, status, sender_id) on public.messages to authenticated;
grant insert (org_id, title, body, priority, requester_id, assignee_id) on public.tickets to authenticated;
grant update (title, body, status, priority, assignee_id) on public.tickets to authenticated;
grant delete on public.tickets to authenticated;
grant insert (org_id, ticket_id, body, author_id) on public.ticket_comments to authenticated;
grant delete on public.ticket_comments to authenticated;

-- ---------------------------------------------------------------- funções chamadas pelo app (usuário logado)
-- Criar canal: só administradores. O segredo do webhook é gerado aqui; o app nunca o recebe de volta, exceto o admin.
create function public.create_whatsapp_channel(p_org uuid, p_provider text, p_name text, p_external_id text, p_secrets jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Apenas administradores configuram o WhatsApp' using errcode = '42501';
  end if;
  insert into public.whatsapp_channels (org_id, provider, name, external_id, created_by)
  values (p_org, p_provider, btrim(p_name), nullif(btrim(coalesce(p_external_id, '')), ''), auth.uid())
  returning id into v_id;
  insert into public.channel_secrets (channel_id, data)
  values (v_id, coalesce(p_secrets, '{}'::jsonb) || jsonb_build_object('webhook_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')));
  return v_id;
end;
$$;

-- Atualizar segredos: só administradores; valores vazios mantêm o que já existe.
create function public.save_channel_secrets(p_channel uuid, p_secrets jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  k text;
  v text;
begin
  select org_id into v_org from public.whatsapp_channels where id = p_channel;
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception 'Apenas administradores configuram o WhatsApp' using errcode = '42501';
  end if;
  for k, v in select key, value from jsonb_each_text(coalesce(p_secrets, '{}'::jsonb)) loop
    if k <> 'webhook_secret' and btrim(coalesce(v, '')) <> '' then
      update public.channel_secrets set data = data || jsonb_build_object(k, btrim(v)), updated_at = now() where channel_id = p_channel;
    end if;
  end loop;
end;
$$;

-- O admin vê QUAIS segredos estão preenchidos (nunca os valores) e o segredo do webhook (que ele cola na Meta).
create function public.channel_setup_info(p_channel uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
  v_data jsonb;
begin
  select org_id into v_org from public.whatsapp_channels where id = p_channel;
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception 'Apenas administradores configuram o WhatsApp' using errcode = '42501';
  end if;
  select data into v_data from public.channel_secrets where channel_id = p_channel;
  return jsonb_build_object(
    'webhook_secret', v_data ->> 'webhook_secret',
    'configured', (select coalesce(jsonb_agg(key order by key), '[]'::jsonb) from jsonb_object_keys(coalesce(v_data, '{}'::jsonb)) as key where key <> 'webhook_secret')
  );
end;
$$;

-- Iniciar conversa com um número (qualquer membro). Reaproveita a conversa se já existir.
create function public.start_conversation(p_channel uuid, p_phone text, p_name text default null, p_contact uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ch public.whatsapp_channels;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id uuid;
begin
  select * into ch from public.whatsapp_channels where id = p_channel;
  if not found or not public.is_org_member(ch.org_id) then
    raise exception 'Canal não encontrado' using errcode = 'P0002';
  end if;
  if v_phone !~ '^[0-9]{6,20}$' then
    raise exception 'Telefone inválido' using errcode = 'P0001';
  end if;
  if p_contact is not null and not exists (select 1 from public.contacts where id = p_contact and org_id = ch.org_id) then
    raise exception 'Contato inválido' using errcode = 'P0001';
  end if;
  insert into public.conversations (org_id, channel_id, phone, display_name, contact_id, assignee_id)
  values (ch.org_id, p_channel, v_phone, nullif(btrim(coalesce(p_name, '')), ''), p_contact,
          (select user_id from public.memberships where org_id = ch.org_id and user_id = auth.uid()))
  on conflict (channel_id, phone) do update set contact_id = coalesce(public.conversations.contact_id, excluded.contact_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- funções do servidor (exigem a chave interna)
-- Usadas pelos webhooks e pelo envio de mensagens. Executáveis sem login, mas inúteis sem a chave.
create function public.wa_channel_for_server(p_key text, p_channel uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ch public.whatsapp_channels;
begin
  if not public.internal_ok(p_key) then raise exception 'Não autorizado' using errcode = '42501'; end if;
  select * into ch from public.whatsapp_channels where id = p_channel;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', ch.id, 'org_id', ch.org_id, 'provider', ch.provider, 'external_id', ch.external_id, 'status', ch.status,
    'secrets', coalesce((select data from public.channel_secrets where channel_id = ch.id), '{}'::jsonb)
  );
end;
$$;

-- Dados para enviar uma mensagem já gravada (fila): vem do banco, nunca do navegador.
create function public.wa_message_for_send(p_key text, p_message uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m public.messages;
  c public.conversations;
begin
  if not public.internal_ok(p_key) then raise exception 'Não autorizado' using errcode = '42501'; end if;
  select * into m from public.messages where id = p_message and direction = 'out' and status = 'queued';
  if not found then return null; end if;
  select * into c from public.conversations where id = m.conversation_id;
  return jsonb_build_object(
    'message_id', m.id, 'body', m.body, 'phone', c.phone, 'last_inbound_at', c.last_inbound_at,
    'channel', public.wa_channel_for_server(p_key, c.channel_id)
  );
end;
$$;

create function public.wa_message_result(p_key text, p_message uuid, p_status text, p_external_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.internal_ok(p_key) then raise exception 'Não autorizado' using errcode = '42501'; end if;
  if p_status not in ('sent', 'failed') then raise exception 'Status inválido' using errcode = 'P0001'; end if;
  update public.messages set status = p_status, external_id = coalesce(p_external_id, external_id), error = left(p_error, 300)
  where id = p_message and direction = 'out';
end;
$$;

-- Atualização de entrega/leitura vinda da operadora (só avança: enviada → entregue → lida).
create function public.wa_message_status(p_key text, p_channel uuid, p_external_id text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  rank_of constant jsonb := '{"queued":0,"sent":1,"delivered":2,"read":3}';
begin
  if not public.internal_ok(p_key) then raise exception 'Não autorizado' using errcode = '42501'; end if;
  if p_status not in ('sent', 'delivered', 'read', 'failed') then return; end if;
  update public.messages m set status = p_status
  from public.conversations c
  where c.id = m.conversation_id and c.channel_id = p_channel and m.external_id = p_external_id and m.direction = 'out'
    and (p_status = 'failed' or coalesce((rank_of ->> m.status)::int, 0) < (rank_of ->> p_status)::int);
end;
$$;

create function public.wa_set_channel_status(p_key text, p_channel uuid, p_status text, p_detail text default null, p_phone text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.internal_ok(p_key) then raise exception 'Não autorizado' using errcode = '42501'; end if;
  if p_status not in ('disconnected', 'connecting', 'connected', 'error') then raise exception 'Status inválido' using errcode = 'P0001'; end if;
  update public.whatsapp_channels
  set status = p_status, status_detail = left(p_detail, 300), phone = coalesce(nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''), phone)
  where id = p_channel;
end;
$$;

-- Mensagem recebida do cliente. Cria a conversa se for a primeira; vincula a um contato de mesmo telefone, se houver.
-- Devolve null quando a mensagem já tinha sido recebida (a operadora reenvia webhooks).
create function public.wa_ingest(p_key text, p_channel uuid, p_phone text, p_name text, p_body text, p_external_id text, p_at timestamptz default now())
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
    where org_id = ch.org_id and char_length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 8
      and right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_phone, 9)
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

-- ---------------------------------------------------------------- permissões das funções
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_org_member(uuid), public.is_org_admin(uuid), public.is_org_manager(uuid), public.shares_org_with(uuid),
  public.create_organization(text), public.accept_invitation(uuid), public.create_pipeline(uuid, text),
  public.local_day_start(), public.local_month_start(), public.dashboard_stats(uuid),
  public.create_whatsapp_channel(uuid, text, text, text, jsonb), public.save_channel_secrets(uuid, jsonb),
  public.channel_setup_info(uuid), public.start_conversation(uuid, text, text, uuid)
to authenticated;
-- Nenhum usuário (nem logado) mexe na chave interna: no Supabase novas funções já nascem executáveis por "authenticated".
revoke execute on function public.set_internal_key(text), public.internal_ok(text) from public, anon, authenticated;
-- Só as funções de servidor podem ser chamadas sem login; todas exigem a chave interna.
grant execute on function
  public.wa_channel_for_server(text, uuid), public.wa_message_for_send(text, uuid),
  public.wa_message_result(text, uuid, text, text, text), public.wa_message_status(text, uuid, text, text),
  public.wa_set_channel_status(text, uuid, text, text, text),
  public.wa_ingest(text, uuid, text, text, text, text, timestamptz)
to anon, authenticated;

-- ==== 20261117000100_analytics.sql ====
-- Altum CRM — migração 6: indicadores da página Análises.
-- Uma única função (SECURITY INVOKER: respeita a RLS de quem chama, então só enxerga a própria organização)
-- devolve todos os números do período escolhido. Dia e mês seguem o fuso de Brasília.

create function public.analytics_overview(p_org uuid, p_days int default 90) returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  cfg as (
    select greatest(1, least(coalesce(p_days, 90), 730)) as days,
           now() - greatest(1, least(coalesce(p_days, 90), 730)) * interval '1 day' as since
  ),
  d as (
    select d.*, s.kind, s.name as stage_name, s.position as stage_pos, s.probability,
           c.source as contact_source
    from public.deals d
    join public.stages s on s.id = d.stage_id
    left join public.contacts c on c.id = d.contact_id and c.org_id = d.org_id
    where d.org_id = p_org
  ),
  won as (select * from d where kind = 'won' and closed_at >= (select since from cfg)),
  lost as (select * from d where kind = 'lost' and closed_at >= (select since from cfg)),
  first_pipe as (select id from public.pipelines where org_id = p_org order by position, created_at limit 1),
  first_in as (
    select conversation_id, min(created_at) as t
    from public.messages
    where org_id = p_org and direction = 'in' and created_at >= (select since from cfg)
    group by conversation_id
  ),
  first_out as (
    select f.conversation_id, f.t as t_in, min(m.created_at) as t_out
    from first_in f
    join public.messages m on m.conversation_id = f.conversation_id and m.direction = 'out' and m.created_at > f.t
    group by f.conversation_id, f.t
  )
  select jsonb_build_object(
    'days', (select days from cfg),
    'created_count', (select count(*) from d where created_at >= (select since from cfg)),
    'created_value', (select coalesce(sum(value), 0) from d where created_at >= (select since from cfg)),
    'won_count', (select count(*) from won),
    'won_value', (select coalesce(sum(value), 0) from won),
    'lost_count', (select count(*) from lost),
    'lost_value', (select coalesce(sum(value), 0) from lost),
    'win_rate', (select case when (select count(*) from won) + (select count(*) from lost) = 0 then null
                             else round((select count(*) from won)::numeric * 100 / ((select count(*) from won) + (select count(*) from lost)), 1) end),
    'avg_deal_value', (select case when count(*) = 0 then null else round(sum(value) / count(*), 2) end from won),
    'avg_cycle_days', (select round(avg(extract(epoch from closed_at - created_at) / 86400)::numeric, 1) from won),
    'open_count', (select count(*) from d where kind = 'open'),
    'open_value', (select coalesce(sum(value), 0) from d where kind = 'open'),
    'open_weighted', (select coalesce(sum(value * probability / 100.0), 0) from d where kind = 'open'),
    'by_month', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(mo.m, 'YYYY-MM'), 'value', coalesce(w.v, 0), 'count', coalesce(w.c, 0)) order by mo.m), '[]'::jsonb)
      from (
        select gs as m from generate_series(
          date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '5 months',
          date_trunc('month', now() at time zone 'America/Sao_Paulo'),
          interval '1 month') gs
      ) mo
      left join (
        select date_trunc('month', closed_at at time zone 'America/Sao_Paulo') as mm, sum(value) as v, count(*) as c
        from d where kind = 'won' and closed_at is not null group by 1
      ) w on w.mm = mo.m
    ),
    'by_owner', (
      select coalesce(jsonb_agg(jsonb_build_object('owner_id', o.owner_id, 'won_count', o.wc, 'won_value', o.wv, 'lost_count', o.lc, 'open_count', o.oc, 'open_value', o.ov) order by o.wv desc, o.oc desc), '[]'::jsonb)
      from (
        select owner_id,
               count(*) filter (where kind = 'won' and closed_at >= (select since from cfg)) as wc,
               coalesce(sum(value) filter (where kind = 'won' and closed_at >= (select since from cfg)), 0) as wv,
               count(*) filter (where kind = 'lost' and closed_at >= (select since from cfg)) as lc,
               count(*) filter (where kind = 'open') as oc,
               coalesce(sum(value) filter (where kind = 'open'), 0) as ov
        from d group by owner_id
      ) o
    ),
    'lost_reasons', (
      select coalesce(jsonb_agg(jsonb_build_object('reason', x.r, 'count', x.n) order by x.n desc, x.r), '[]'::jsonb)
      from (select coalesce(nullif(btrim(lost_reason), ''), 'Não informado') as r, count(*) as n from lost group by 1 order by n desc, r limit 8) x
    ),
    'by_source', (
      select coalesce(jsonb_agg(jsonb_build_object('source', x.src, 'created', x.created, 'won_count', x.wc, 'won_value', x.wv) order by x.wv desc, x.created desc), '[]'::jsonb)
      from (
        select coalesce(nullif(btrim(contact_source), ''), 'Sem origem') as src,
               count(*) filter (where created_at >= (select since from cfg)) as created,
               count(*) filter (where kind = 'won' and closed_at >= (select since from cfg)) as wc,
               coalesce(sum(value) filter (where kind = 'won' and closed_at >= (select since from cfg)), 0) as wv
        from d group by 1
        having count(*) filter (where created_at >= (select since from cfg)) > 0
            or count(*) filter (where kind = 'won' and closed_at >= (select since from cfg)) > 0
        order by wv desc, created desc limit 8
      ) x
    ),
    'stages', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'count', coalesce(x.c, 0), 'value', coalesce(x.v, 0), 'avg_days', x.days) order by s.position), '[]'::jsonb)
      from public.stages s
      left join (
        select stage_id, count(*) as c, sum(value) as v, round(avg(extract(epoch from now() - stage_changed_at) / 86400)::numeric, 1) as days
        from d where kind = 'open' group by stage_id
      ) x on x.stage_id = s.id
      where s.org_id = p_org and s.pipeline_id = (select id from first_pipe) and s.kind = 'open'
    ),
    'tasks', jsonb_build_object(
      'done_period', (select count(*) from public.tasks where org_id = p_org and done_at >= (select since from cfg)),
      'open', (select count(*) from public.tasks where org_id = p_org and done_at is null),
      'overdue', (select count(*) from public.tasks where org_id = p_org and done_at is null and due_at < public.local_day_start())
    ),
    'atendimento', jsonb_build_object(
      'conversations_open', (select count(*) from public.conversations where org_id = p_org and status = 'open'),
      'conversations_pending', (select count(*) from public.conversations where org_id = p_org and status = 'pending'),
      'conversations_closed', (select count(*) from public.conversations where org_id = p_org and status = 'closed'),
      'conversations_new', (select count(*) from public.conversations where org_id = p_org and created_at >= (select since from cfg)),
      'unread', (select coalesce(sum(unread_count), 0) from public.conversations where org_id = p_org),
      'messages_in', (select count(*) from public.messages where org_id = p_org and direction = 'in' and created_at >= (select since from cfg)),
      'messages_out', (select count(*) from public.messages where org_id = p_org and direction = 'out' and created_at >= (select since from cfg)),
      'avg_first_response_seconds', (select round(avg(extract(epoch from t_out - t_in))::numeric, 0) from first_out),
      'answered_conversations', (select count(*) from first_out),
      'tickets_open', (select count(*) from public.tickets where org_id = p_org and status <> 'resolved')
    )
  );
$$;

revoke execute on function public.analytics_overview(uuid, int) from public, anon;
grant execute on function public.analytics_overview(uuid, int) to authenticated;
