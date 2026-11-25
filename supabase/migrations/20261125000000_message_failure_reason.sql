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
