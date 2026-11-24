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
