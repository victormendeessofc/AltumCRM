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
