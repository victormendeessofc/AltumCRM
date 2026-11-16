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
