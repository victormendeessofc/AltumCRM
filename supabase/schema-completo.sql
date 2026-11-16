-- Altum CRM — esquema completo (todas as migrações em ordem).
-- Cole TUDO no SQL Editor de um projeto Supabase NOVO e clique em Run. Não rode em um projeto que já tem as migrações.

-- ====================================================================
-- 20261116000000_auth_orgs.sql
-- ====================================================================
-- Altum CRM — migração 1: perfis, organizações, membros e convites, com RLS.
-- Regra de ouro: toda tabela de dados tem org_id e só é visível a quem é membro dessa organização.

create type public.org_role as enum ('admin', 'manager', 'seller');

-- ---------------------------------------------------------------- tabelas
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'business')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'seller',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.org_role not null default 'seller',
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invitations_pending_uniq on public.invitations (org_id, lower(email)) where accepted_at is null;

-- ------------------------------------------------- funções auxiliares (SECURITY DEFINER)
-- Rodam com os direitos do dono e, por isso, não entram em recursão com a RLS.
create function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid());
$$;

create function public.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid() and role = 'admin');
$$;

create function public.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on b.org_id = a.org_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- ----------------------------------------------------------------- gatilhos
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nunca deixa uma organização sem administrador.
create function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from public.organizations where id = old.org_id)
     and not exists (
       select 1 from public.memberships
       where org_id = old.org_id and role = 'admin' and user_id <> old.user_id
     ) then
    raise exception 'A organização precisa ter pelo menos um administrador' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger memberships_guard_last_admin before update or delete on public.memberships
  for each row execute function public.guard_last_admin();

-- ------------------------------------------------------------------- RPCs
-- Criar organização: o criador vira administrador. Não existe INSERT direto em organizations/memberships.
create function public.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  insert into public.organizations (name, created_by) values (btrim(p_name), auth.uid()) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'admin');
  return v_org;
end;
$$;

-- Aceitar convite: só quem tem o e-mail convidado, com token válido e não expirado.
create function public.accept_invitation(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invitations;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  select * into v_inv from public.invitations
  where token = p_token and accepted_at is null and expires_at > now()
    and lower(email) = lower(coalesce(auth.email(), ''));
  if not found then
    raise exception 'Convite inválido, expirado ou destinado a outro e-mail' using errcode = 'P0002';
  end if;
  insert into public.memberships (org_id, user_id, role) values (v_inv.org_id, auth.uid(), v_inv.role)
  on conflict (org_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.org_id;
end;
$$;

-- ------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy memberships_select on public.memberships for select to authenticated
  using (public.is_org_member(org_id));
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.is_org_admin(org_id) or user_id = auth.uid());

create policy invitations_select on public.invitations for select to authenticated
  using (public.is_org_admin(org_id));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.is_org_admin(org_id) and invited_by = auth.uid());
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.is_org_admin(org_id));

-- ------------------------------------------------------------- permissões (privilégio mínimo)
revoke all on public.profiles, public.organizations, public.memberships, public.invitations from anon, authenticated;
grant select on public.profiles, public.organizations, public.memberships, public.invitations to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant update (name) on public.organizations to authenticated;
grant update (role) on public.memberships to authenticated;
grant delete on public.memberships, public.invitations to authenticated;
grant insert (org_id, email, role, invited_by) on public.invitations to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_org_member(uuid), public.is_org_admin(uuid), public.shares_org_with(uuid),
  public.create_organization(text), public.accept_invitation(uuid)
to authenticated;

-- ====================================================================
-- 20261116000100_profiles_email.sql
-- ====================================================================
-- Altum CRM — migração 2: e-mail no perfil (necessário para listar membros na Administração).
-- A leitura continua protegida pela política profiles_select: só o próprio usuário e quem divide organização.

alter table public.profiles add column email text not null default '';

update public.profiles p set email = u.email from auth.users u where u.id = p.id and u.email is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ====================================================================
-- 20261116000200_contacts.sql
-- ====================================================================
-- Altum CRM — migração 3: empresas e contatos.
-- Todo dado pertence a uma organização (org_id). Chaves estrangeiras compostas impedem
-- vincular um contato a empresa ou responsável de OUTRA organização.

create function public.is_org_manager(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role in ('admin', 'manager')
  );
$$;
revoke execute on function public.is_org_manager(uuid) from public, anon;
grant execute on function public.is_org_manager(uuid) to authenticated;

create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- empresas
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  website text check (website is null or char_length(website) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index companies_name_uniq on public.companies (org_id, lower(btrim(name)));

-- ---------------------------------------------------------------- contatos
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text check (email is null or (char_length(email) <= 254 and position('@' in email) > 1)),
  phone text check (phone is null or char_length(phone) <= 40),
  job_title text check (job_title is null or char_length(job_title) <= 120),
  company_id uuid,
  owner_id uuid,
  source text check (source is null or char_length(source) <= 60),
  notes text check (notes is null or char_length(notes) <= 5000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, company_id) references public.companies (org_id, id) on delete set null (company_id),
  foreign key (org_id, owner_id) references public.memberships (org_id, user_id) on delete set null (owner_id)
);
create unique index contacts_email_uniq on public.contacts (org_id, lower(email)) where email is not null and email <> '';
create index contacts_org_created_idx on public.contacts (org_id, created_at desc);
create index contacts_org_name_idx on public.contacts (org_id, lower(name));
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------- RLS
alter table public.companies enable row level security;
alter table public.contacts enable row level security;

create policy companies_select on public.companies for select to authenticated using (public.is_org_member(org_id));
create policy companies_insert on public.companies for insert to authenticated
  with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy companies_update on public.companies for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy companies_delete on public.companies for delete to authenticated using (public.is_org_manager(org_id));

create policy contacts_select on public.contacts for select to authenticated using (public.is_org_member(org_id));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy contacts_update on public.contacts for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy contacts_delete on public.contacts for delete to authenticated using (public.is_org_manager(org_id));

-- ------------------------------------------------------------- permissões
revoke all on public.companies, public.contacts from anon, authenticated;
grant select, delete on public.companies, public.contacts to authenticated;
grant insert (org_id, name, website, created_by) on public.companies to authenticated;
grant update (name, website) on public.companies to authenticated;
grant insert (org_id, name, email, phone, job_title, company_id, owner_id, source, notes, created_by) on public.contacts to authenticated;
grant update (name, email, phone, job_title, company_id, owner_id, source, notes) on public.contacts to authenticated;

-- ====================================================================
-- 20261116000300_crm_core.sql
-- ====================================================================
-- Altum CRM — migração 4: funis, negócios, tarefas, atividades, notificações, auditoria e indicadores.
-- Mesmo princípio das anteriores: tudo carrega org_id; chaves estrangeiras compostas impedem
-- cruzar dados entre organizações; RLS restringe o acesso a quem é membro.

-- ------------------------------------------------------------ organização: meta mensal e exclusão
alter table public.organizations add column monthly_goal numeric(14, 2) not null default 0 check (monthly_goal >= 0);
grant update (name, monthly_goal) on public.organizations to authenticated;
grant delete on public.organizations to authenticated;
create policy organizations_delete on public.organizations for delete to authenticated using (public.is_org_admin(id));

alter table public.contacts add constraint contacts_org_id_id_key unique (org_id, id);

-- ------------------------------------------------------------------ funis e etapas
create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  pipeline_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position int not null default 0,
  probability smallint not null default 0 check (probability between 0 and 100),
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (pipeline_id, id),
  foreign key (org_id, pipeline_id) references public.pipelines (org_id, id) on delete cascade
);
create index stages_pipeline_idx on public.stages (pipeline_id, position);

-- Cria as etapas padrão de um funil de vendas.
create function public.seed_pipeline(p_org uuid, p_name text, p_position int default 0) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pipe uuid;
begin
  insert into public.pipelines (org_id, name, position) values (p_org, p_name, p_position) returning id into v_pipe;
  insert into public.stages (org_id, pipeline_id, name, position, probability, kind) values
    (p_org, v_pipe, 'Prospecção', 0, 10, 'open'),
    (p_org, v_pipe, 'Qualificação', 10, 25, 'open'),
    (p_org, v_pipe, 'Proposta', 20, 50, 'open'),
    (p_org, v_pipe, 'Negociação', 30, 75, 'open'),
    (p_org, v_pipe, 'Ganho', 40, 100, 'won'),
    (p_org, v_pipe, 'Perdido', 50, 0, 'lost');
  return v_pipe;
end;
$$;
revoke execute on function public.seed_pipeline(uuid, text, int) from public, anon, authenticated;

-- Admin cria um funil novo (com as etapas padrão) na própria organização.
create function public.create_pipeline(p_org uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Apenas administradores criam funis' using errcode = '42501';
  end if;
  return public.seed_pipeline(p_org, btrim(p_name), (select coalesce(max(position) + 1, 0) from public.pipelines where org_id = p_org));
end;
$$;

-- Novas organizações já nascem com um funil pronto para uso.
create or replace function public.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  insert into public.organizations (name, created_by) values (btrim(p_name), auth.uid()) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'admin');
  perform public.seed_pipeline(v_org, 'Vendas', 0);
  return v_org;
end;
$$;

-- Organizações que já existem ganham o funil padrão.
do $$
declare r record;
begin
  for r in select id from public.organizations o where not exists (select 1 from public.pipelines p where p.org_id = o.id) loop
    perform public.seed_pipeline(r.id, 'Vendas', 0);
  end loop;
end $$;

-- ------------------------------------------------------------------ negócios
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  pipeline_id uuid not null,
  stage_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  value numeric(14, 2) not null default 0 check (value >= 0),
  contact_id uuid,
  company_id uuid,
  owner_id uuid,
  expected_close date,
  lost_reason text check (lost_reason is null or char_length(lost_reason) <= 300),
  notes text check (notes is null or char_length(notes) <= 5000),
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, pipeline_id) references public.pipelines (org_id, id),
  foreign key (pipeline_id, stage_id) references public.stages (pipeline_id, id),
  foreign key (org_id, contact_id) references public.contacts (org_id, id) on delete set null (contact_id),
  foreign key (org_id, company_id) references public.companies (org_id, id) on delete set null (company_id),
  foreign key (org_id, owner_id) references public.memberships (org_id, user_id) on delete set null (owner_id)
);
create index deals_board_idx on public.deals (org_id, pipeline_id, stage_id);
create index deals_owner_idx on public.deals (org_id, owner_id);
create index deals_closed_idx on public.deals (org_id, closed_at) where closed_at is not null;
create index deals_title_idx on public.deals (org_id, lower(title));

-- Regras do negócio: a etapa pertence ao funil; datas de mudança/fechamento; motivo só em perdidos.
create function public.deals_before_write() returns trigger language plpgsql as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.stages where id = new.stage_id and org_id = new.org_id;
  if v_kind is null then
    raise exception 'Etapa inválida' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    new.stage_changed_at = now();
  end if;
  if v_kind in ('won', 'lost') then
    if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
      new.closed_at = now();
    end if;
  else
    new.closed_at = null;
  end if;
  if v_kind <> 'lost' then
    new.lost_reason = null;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger deals_before_write before insert or update on public.deals
  for each row execute function public.deals_before_write();

-- ------------------------------------------------------------------ tarefas
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 5000),
  due_at timestamptz,
  done_at timestamptz,
  assignee_id uuid,
  deal_id uuid,
  contact_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, assignee_id) references public.memberships (org_id, user_id) on delete set null (assignee_id),
  foreign key (org_id, deal_id) references public.deals (org_id, id) on delete cascade,
  foreign key (org_id, contact_id) references public.contacts (org_id, id) on delete cascade
);
create index tasks_open_idx on public.tasks (org_id, due_at) where done_at is null;
create index tasks_assignee_idx on public.tasks (org_id, assignee_id);
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ atividades (linha do tempo)
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  deal_id uuid,
  contact_id uuid,
  kind text not null check (kind in ('note', 'call', 'meeting', 'email', 'stage_change', 'won', 'lost')),
  body text check (body is null or char_length(body) <= 5000),
  meta jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (org_id, deal_id) references public.deals (org_id, id) on delete cascade,
  foreign key (org_id, contact_id) references public.contacts (org_id, id) on delete cascade,
  check (deal_id is not null or contact_id is not null)
);
create index activities_deal_idx on public.activities (deal_id, created_at desc);
create index activities_contact_idx on public.activities (contact_id, created_at desc);
create index activities_feed_idx on public.activities (org_id, created_at desc);

-- Registra automaticamente mudança de etapa, ganho e perda.
create function public.deals_log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_from text;
  v_to text;
  v_kind text;
begin
  if tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id then
    select name into v_from from public.stages where id = old.stage_id;
    select name, kind into v_to, v_kind from public.stages where id = new.stage_id;
    insert into public.activities (org_id, deal_id, kind, body, meta, actor_id)
    values (
      new.org_id, new.id,
      case v_kind when 'won' then 'won' when 'lost' then 'lost' else 'stage_change' end,
      case when v_kind = 'lost' then new.lost_reason else null end,
      jsonb_build_object('from', v_from, 'to', v_to, 'value', new.value),
      auth.uid()
    );
  end if;
  return null;
end;
$$;
create trigger deals_log_activity after update on public.deals for each row execute function public.deals_log_activity();

-- ------------------------------------------------------------------ notificações
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null check (char_length(title) <= 200),
  body text check (body is null or char_length(body) <= 500),
  link text check (link is null or link ~ '^/[a-z]'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create function public.notify_assignments() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new uuid;
  v_old uuid;
begin
  if tg_table_name = 'deals' then
    v_new := new.owner_id;
    v_old := case when tg_op = 'UPDATE' then old.owner_id end;
    if v_new is not null and v_new is distinct from v_old and v_new is distinct from auth.uid() then
      insert into public.notifications (org_id, user_id, kind, title, body, link)
      values (new.org_id, v_new, 'deal_assigned', 'Negócio atribuído a você', new.title, '/funis?deal=' || new.id);
    end if;
  elsif tg_table_name = 'tasks' then
    v_new := new.assignee_id;
    v_old := case when tg_op = 'UPDATE' then old.assignee_id end;
    if v_new is not null and v_new is distinct from v_old and v_new is distinct from auth.uid() then
      insert into public.notifications (org_id, user_id, kind, title, body, link)
      values (new.org_id, v_new, 'task_assigned', 'Tarefa atribuída a você', new.title, '/tarefas');
    end if;
  end if;
  return null;
end;
$$;
create trigger deals_notify after insert or update of owner_id on public.deals for each row execute function public.notify_assignments();
create trigger tasks_notify after insert or update of assignee_id on public.tasks for each row execute function public.notify_assignments();

-- Avisa o responsável (e os gestores) quando um negócio é ganho por outra pessoa.
create function public.notify_deal_won() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  if new.stage_id is distinct from old.stage_id then
    select kind into v_kind from public.stages where id = new.stage_id;
    if v_kind = 'won' and new.owner_id is not null and new.owner_id is distinct from auth.uid() then
      insert into public.notifications (org_id, user_id, kind, title, body, link)
      values (new.org_id, new.owner_id, 'deal_won', 'Negócio ganho', new.title, '/funis?deal=' || new.id);
    end if;
  end if;
  return null;
end;
$$;
create trigger deals_notify_won after update of stage_id on public.deals for each row execute function public.notify_deal_won();

-- ------------------------------------------------------------------ auditoria
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid,
  table_name text not null,
  op text not null,
  row_key text,
  changed text[],
  created_at timestamptz not null default now()
);
create index audit_org_idx on public.audit_log (org_id, created_at desc);

-- Guarda quem fez o quê, mas só os NOMES dos campos alterados (nunca os valores: evita copiar dados pessoais).
create function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_org uuid := (to_jsonb(coalesce(new, old)) ->> 'org_id')::uuid;
  v_changed text[];
begin
  if tg_table_name = 'organizations' then
    v_org := (v_row ->> 'id')::uuid;
  end if;
  if not exists (select 1 from public.organizations where id = v_org) then
    return null; -- organização sendo apagada em cascata
  end if;
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key) and n.key not in ('updated_at', 'stage_changed_at');
    if v_changed is null then
      return null;
    end if;
  end if;
  insert into public.audit_log (org_id, actor_id, table_name, op, row_key, changed)
  values (v_org, auth.uid(), tg_table_name, tg_op, coalesce(v_row ->> 'id', (v_row ->> 'org_id') || ':' || (v_row ->> 'user_id')), v_changed);
  return null;
end;
$$;
create trigger audit_contacts after insert or update or delete on public.contacts for each row execute function public.audit_row();
create trigger audit_deals after insert or update or delete on public.deals for each row execute function public.audit_row();
create trigger audit_tasks after insert or update or delete on public.tasks for each row execute function public.audit_row();
create trigger audit_memberships after insert or update or delete on public.memberships for each row execute function public.audit_row();
create trigger audit_invitations after insert or delete on public.invitations for each row execute function public.audit_row();
create trigger audit_pipelines after insert or update or delete on public.pipelines for each row execute function public.audit_row();
create trigger audit_stages after insert or update or delete on public.stages for each row execute function public.audit_row();
create trigger audit_organizations after update on public.organizations for each row execute function public.audit_row();

-- ------------------------------------------------------------------ RLS
alter table public.pipelines enable row level security;
alter table public.stages enable row level security;
alter table public.deals enable row level security;
alter table public.tasks enable row level security;
alter table public.activities enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

create policy pipelines_select on public.pipelines for select to authenticated using (public.is_org_member(org_id));
create policy pipelines_insert on public.pipelines for insert to authenticated with check (public.is_org_admin(org_id));
create policy pipelines_update on public.pipelines for update to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy pipelines_delete on public.pipelines for delete to authenticated using (public.is_org_admin(org_id));

create policy stages_select on public.stages for select to authenticated using (public.is_org_member(org_id));
create policy stages_insert on public.stages for insert to authenticated with check (public.is_org_admin(org_id));
create policy stages_update on public.stages for update to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy stages_delete on public.stages for delete to authenticated using (public.is_org_admin(org_id));

create policy deals_select on public.deals for select to authenticated using (public.is_org_member(org_id));
create policy deals_insert on public.deals for insert to authenticated with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy deals_update on public.deals for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy deals_delete on public.deals for delete to authenticated using (public.is_org_manager(org_id));

create policy tasks_select on public.tasks for select to authenticated using (public.is_org_member(org_id));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy tasks_update on public.tasks for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_org_manager(org_id) or created_by = auth.uid() or assignee_id = auth.uid());

create policy activities_select on public.activities for select to authenticated using (public.is_org_member(org_id));
create policy activities_insert on public.activities for insert to authenticated
  with check (public.is_org_member(org_id) and actor_id = auth.uid() and kind in ('note', 'call', 'meeting', 'email'));
create policy activities_delete on public.activities for delete to authenticated using (public.is_org_manager(org_id));

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

create policy audit_select on public.audit_log for select to authenticated using (public.is_org_admin(org_id));

-- ------------------------------------------------------------- permissões (privilégio mínimo)
revoke all on public.pipelines, public.stages, public.deals, public.tasks, public.activities, public.notifications, public.audit_log from anon, authenticated;
grant select on public.pipelines, public.stages, public.deals, public.tasks, public.activities, public.notifications, public.audit_log to authenticated;

grant insert (org_id, name, position) on public.pipelines to authenticated;
grant update (name, position) on public.pipelines to authenticated;
grant delete on public.pipelines to authenticated;
grant insert (org_id, pipeline_id, name, position, probability, kind) on public.stages to authenticated;
grant update (name, position, probability) on public.stages to authenticated;
grant delete on public.stages to authenticated;

grant insert (org_id, pipeline_id, stage_id, title, value, contact_id, company_id, owner_id, expected_close, notes, created_by) on public.deals to authenticated;
grant update (stage_id, title, value, contact_id, company_id, owner_id, expected_close, lost_reason, notes) on public.deals to authenticated;
grant delete on public.deals to authenticated;

grant insert (org_id, title, notes, due_at, assignee_id, deal_id, contact_id, created_by) on public.tasks to authenticated;
grant update (title, notes, due_at, done_at, assignee_id, deal_id, contact_id) on public.tasks to authenticated;
grant delete on public.tasks to authenticated;

grant insert (org_id, deal_id, contact_id, kind, body, actor_id) on public.activities to authenticated;
grant delete on public.activities to authenticated;

grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

-- ------------------------------------------------------------------ indicadores da Central
-- Dia e mês são contados no fuso de Brasília (o servidor roda em UTC).
create function public.local_day_start() returns timestamptz language sql stable as $$
  select date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;
create function public.local_month_start() returns timestamptz language sql stable as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;
-- SECURITY INVOKER: respeita a RLS de quem chama.
create function public.dashboard_stats(p_org uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  d as (
    select d.*, s.kind, s.probability, s.name as stage_name, s.position as stage_pos
    from public.deals d join public.stages s on s.id = d.stage_id
    where d.org_id = p_org
  ),
  pipe as (select id from public.pipelines where org_id = p_org order by position, created_at limit 1)
  select jsonb_build_object(
    'open_count',     (select count(*) from d where kind = 'open'),
    'open_value',     (select coalesce(sum(value), 0) from d where kind = 'open'),
    'weighted_value', (select coalesce(sum(value * probability / 100.0), 0) from d where kind = 'open'),
    'won_month_value', (select coalesce(sum(value), 0) from d where kind = 'won' and closed_at >= public.local_month_start()),
    'won_month_count', (select count(*) from d where kind = 'won' and closed_at >= public.local_month_start()),
    'lost_month_count', (select count(*) from d where kind = 'lost' and closed_at >= public.local_month_start()),
    'goal',           (select monthly_goal from public.organizations where id = p_org),
    'stalled_count',  (select count(*) from d where kind = 'open' and stage_changed_at < now() - interval '7 days'),
    'stalled_value',  (select coalesce(sum(value), 0) from d where kind = 'open' and stage_changed_at < now() - interval '7 days'),
    'tasks_today',    (select count(*) from public.tasks where org_id = p_org and done_at is null and due_at >= public.local_day_start() and due_at < public.local_day_start() + interval '1 day'),
    'tasks_overdue',  (select count(*) from public.tasks where org_id = p_org and done_at is null and due_at < public.local_day_start()),
    'new_contacts_30d', (select count(*) from public.contacts where org_id = p_org and created_at >= now() - interval '30 days'),
    'by_stage', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'count', coalesce(x.c, 0), 'value', coalesce(x.v, 0)) order by s.position), '[]'::jsonb)
      from public.stages s
      left join (select stage_id, count(*) c, sum(value) v from d group by stage_id) x on x.stage_id = s.id
      where s.pipeline_id = (select id from pipe) and s.kind <> 'lost'
    ),
    'won_by_owner', (
      select coalesce(jsonb_agg(jsonb_build_object('owner_id', owner_id, 'value', v, 'count', c) order by v desc), '[]'::jsonb)
      from (select owner_id, sum(value) v, count(*) c from d where kind = 'won' and closed_at >= public.local_month_start() group by owner_id order by sum(value) desc limit 10) w
    )
  );
$$;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_pipeline(uuid, text), public.local_day_start(), public.local_month_start(), public.dashboard_stats(uuid), public.create_organization(text), public.accept_invitation(uuid),
  public.is_org_member(uuid), public.is_org_admin(uuid), public.is_org_manager(uuid), public.shares_org_with(uuid) to authenticated;
