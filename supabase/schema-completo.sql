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

-- ====================================================================
-- 20261117000000_atendimento.sql
-- ====================================================================
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

-- ====================================================================
-- 20261117000100_analytics.sql
-- ====================================================================
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

-- ====================================================================
-- 20261124000000_realtime.sql
-- ====================================================================
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

-- ====================================================================
-- 20261124000100_quick_replies.sql
-- ====================================================================
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

-- ====================================================================
-- 20261124000200_contacts_tags_fields.sql
-- ====================================================================
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

-- ====================================================================
-- 20261124000300_whatsapp_meta_app.sql
-- ====================================================================
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

-- ====================================================================
-- 20261125000000_message_failure_reason.sql
-- ====================================================================
-- Motivo da falha avisada DEPOIS pela Meta.
-- Às vezes a Meta aceita o envio (devolve o id da mensagem) e só alguns segundos depois manda, pelo webhook,
-- o status "failed" com o motivo. Antes só o status era gravado e a tela mostrava o alerta sem explicação.
-- Função separada (e não um parâmetro novo em wa_message_status) para o código funcionar antes e depois desta migração.

create function public.wa_message_error(p_key text, p_channel uuid, p_external_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.internal_ok(p_key) then raise exception 'Não autorizado' using errcode = '42501'; end if;
  update public.messages m set error = left(nullif(btrim(coalesce(p_error, '')), ''), 300)
  from public.conversations c
  where c.id = m.conversation_id and c.channel_id = p_channel and m.external_id = p_external_id
    and m.direction = 'out' and m.status = 'failed';
end;
$$;
revoke execute on function public.wa_message_error(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.wa_message_error(text, uuid, text, text) to anon, authenticated;
