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
