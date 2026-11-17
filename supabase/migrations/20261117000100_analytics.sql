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
