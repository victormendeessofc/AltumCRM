import { AlertTriangle, CircleDollarSign, ListChecks, Target, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ACTIVITY_LABEL, daysIn } from "@/lib/deals";
import { formatBRL, formatBRLCompact } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatDue } from "@/lib/tasks";

export const metadata: Metadata = { title: "Central" };

interface Stats {
  open_count: number;
  open_value: number;
  weighted_value: number;
  won_month_value: number;
  won_month_count: number;
  lost_month_count: number;
  goal: number;
  stalled_count: number;
  stalled_value: number;
  tasks_today: number;
  tasks_overdue: number;
  new_contacts_30d: number;
  by_stage: { id: string; name: string; kind: string; count: number; value: number }[];
  won_by_owner: { owner_id: string | null; value: number; count: number }[];
}

/** Instante de N dias atrás (fora do componente para manter a renderização pura). */
function daysAgoIso(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Kpi({ icon, label, value, hint, href, tone }: { icon: ReactNode; label: string; value: string; hint?: string; href: string; tone?: "warn" | "bad" }) {
  return (
    <Link href={href} className="group rounded-[var(--radius-xl)] border border-line-subtle bg-card p-5 no-underline shadow-[var(--shadow-card)] transition-[border-color,transform] duration-[160ms] ease-out hover:border-line-strong active:scale-[0.99]">
      <div className="mb-3 flex items-center gap-2 text-[13px] text-fg-2">
        <span className="inline-flex size-8 items-center justify-center rounded-xl border border-line bg-raised text-accent">{icon}</span>
        {label}
      </div>
      <p className={`num text-[28px] font-medium leading-none ${tone === "bad" ? "text-danger" : tone === "warn" ? "text-warning" : "text-fg"}`}>{value}</p>
      {hint && <p className="mt-2 text-[12px] text-fg-3">{hint}</p>}
    </Link>
  );
}

export default async function PainelPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const firstName = session.fullName.split(" ")[0];

  const [statsRes, stalledRes, tasksRes, feedRes, pRes] = await Promise.all([
    supabase.rpc("dashboard_stats", { p_org: session.org.id }),
    supabase
      .from("deals")
      .select("id, title, value, stage_changed_at, stage_id")
      .eq("org_id", session.org.id)
      .lt("stage_changed_at", daysAgoIso(7))
      .order("value", { ascending: false })
      .limit(40),
    supabase.from("tasks").select("id, title, due_at").eq("org_id", session.org.id).eq("assignee_id", session.userId).is("done_at", null).not("due_at", "is", null).order("due_at").limit(6),
    supabase.from("activities").select("id, kind, body, meta, deal_id, actor_id, created_at").eq("org_id", session.org.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const s = (statsRes.data ?? {}) as Partial<Stats>;
  const person = new Map((pRes.data ?? []).map((p) => [p.id, p.full_name || p.email]));

  // negócios parados: só os de etapas abertas
  const stageIds = [...new Set((stalledRes.data ?? []).map((d) => d.stage_id))];
  const { data: openStages } = stageIds.length ? await supabase.from("stages").select("id, kind").in("id", stageIds) : { data: [] };
  const openIds = new Set((openStages ?? []).filter((x) => x.kind === "open").map((x) => x.id));
  const stalled = (stalledRes.data ?? []).filter((d) => openIds.has(d.stage_id)).slice(0, 5);

  const dealIds = [...new Set((feedRes.data ?? []).map((a) => a.deal_id).filter((i): i is string => !!i))];
  const { data: feedDeals } = dealIds.length ? await supabase.from("deals").select("id, title").in("id", dealIds) : { data: [] };
  const dealTitle = new Map((feedDeals ?? []).map((d) => [d.id, d.title]));

  const goal = Number(s.goal ?? 0);
  const won = Number(s.won_month_value ?? 0);
  const pct = goal > 0 ? Math.min(100, Math.round((won / goal) * 100)) : 0;
  const maxStage = Math.max(1, ...(s.by_stage ?? []).map((b) => Number(b.value)));
  const empty = Number(s.open_count ?? 0) === 0 && won === 0;

  return (
    <div className="animate-in-up flex flex-col gap-4">
      <div>
        <h1 className="text-[28px] font-medium leading-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="text-[13px] text-fg-2">{session.org.name} · resumo de hoje</p>
      </div>

      {empty && (
        <Card className="flex flex-col gap-2 bg-[image:var(--glow-celery)]">
          <p className="text-lg font-medium">Comece por aqui</p>
          <p className="text-[13px] text-fg-2">
            Cadastre seus primeiros <Link href="/contatos?novo=1">contatos</Link> (ou importe uma planilha), crie um <Link href="/funis?novo=1">negócio</Link> no funil e agende o próximo <Link href="/tarefas?novo=1">follow-up</Link>. Estes números ganham vida assim que houver dados.
          </p>
        </Card>
      )}

      <Card className="flex flex-col gap-4 bg-[image:var(--glow-celery)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[13px] text-fg-2">
              <Target size={16} className="text-accent" aria-hidden /> Meta do mês
            </p>
            <p className="num mt-1 text-[32px] font-medium leading-none">
              {formatBRL(won)} {goal > 0 && <span className="text-lg text-fg-3">/ {formatBRL(goal)}</span>}
            </p>
          </div>
          <p className="num text-right text-[13px] text-fg-2">
            {Number(s.won_month_count ?? 0)} {Number(s.won_month_count ?? 0) === 1 ? "negócio ganho" : "negócios ganhos"} · {Number(s.lost_month_count ?? 0)} perdidos
          </p>
        </div>
        {goal > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Progress value={won} max={goal} />
            <p className="num text-[12px] text-fg-3">
              {pct}% da meta{pct < 100 ? ` · faltam ${formatBRL(goal - won)}` : " · meta batida"}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-fg-3">
            Defina a meta mensal em <Link href="/admin?tab=organizacao">Administração → Organização</Link> para acompanhar o progresso.
          </p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<CircleDollarSign size={16} />} label="Pipeline em aberto" value={formatBRLCompact(Number(s.open_value ?? 0))} hint={`${Number(s.open_count ?? 0)} negócios`} href="/funis" />
        <Kpi icon={<TrendingUp size={16} />} label="Ponderado" value={formatBRLCompact(Number(s.weighted_value ?? 0))} hint="Valor × probabilidade da etapa" href="/funis" />
        <Kpi icon={<AlertTriangle size={16} />} label="Parados há +7 dias" value={String(Number(s.stalled_count ?? 0))} hint={formatBRLCompact(Number(s.stalled_value ?? 0)) + " em risco"} href="/funis?f=stalled" tone={Number(s.stalled_count ?? 0) > 0 ? "warn" : undefined} />
        <Kpi
          icon={<ListChecks size={16} />}
          label="Tarefas de hoje"
          value={String(Number(s.tasks_today ?? 0))}
          hint={Number(s.tasks_overdue ?? 0) > 0 ? `${Number(s.tasks_overdue)} atrasadas` : "Nenhuma atrasada"}
          href={Number(s.tasks_overdue ?? 0) > 0 ? "/tarefas?v=atrasadas&m=all" : "/tarefas?m=all"}
          tone={Number(s.tasks_overdue ?? 0) > 0 ? "bad" : undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Funil por etapa</h2>
          {(s.by_stage ?? []).length === 0 ? (
            <p className="text-[13px] text-fg-3">Sem etapas configuradas.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(s.by_stage ?? []).map((b) => (
                <li key={b.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="truncate">
                      {b.name} <span className="num text-fg-3">· {b.count}</span>
                    </span>
                    <span className="num text-fg-2">{formatBRL(b.value)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[rgb(var(--ink)/0.08)]" role="img" aria-label={`${b.name}: ${b.count} negócios, ${formatBRL(b.value)}`}>
                    <div className={`h-full rounded-full ${b.kind === "won" ? "bg-success" : "bg-accent"}`} style={{ width: `${Math.max(Number(b.value) > 0 ? 3 : 0, (Number(b.value) / maxStage) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Ranking do mês</h2>
          {(s.won_by_owner ?? []).length === 0 ? (
            <p className="text-[13px] text-fg-3">Ninguém fechou negócio neste mês ainda.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {(s.won_by_owner ?? []).map((r, i) => {
                const name = r.owner_id ? (person.get(r.owner_id) ?? "Ex-membro") : "Sem responsável";
                return (
                  <li key={r.owner_id ?? "none"} className="flex items-center gap-3">
                    <span className="num w-5 text-center text-[13px] text-fg-3">{i + 1}</span>
                    <Avatar name={name} size={32} />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="num text-[13px]">{formatBRL(r.value)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Negócios parados</h2>
          {stalled.length === 0 ? (
            <p className="text-[13px] text-fg-3">Nenhum negócio parado. Bom trabalho.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {stalled.map((d) => (
                <li key={d.id}>
                  <Link href={`/funis?deal=${d.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-fg no-underline hover:bg-hover">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{d.title}</span>
                      <span className="text-[12px] text-warning">Parado há {daysIn(d.stage_changed_at)} dias</span>
                    </span>
                    <span className="num text-[13px]">{formatBRL(Number(d.value))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Suas próximas tarefas</h2>
          {(tasksRes.data ?? []).length === 0 ? (
            <p className="text-[13px] text-fg-3">Você não tem tarefas com prazo.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {(tasksRes.data ?? []).map((t) => (
                <li key={t.id}>
                  <Link href={`/tarefas?q=${encodeURIComponent(t.title)}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-fg no-underline hover:bg-hover">
                    <span className="truncate text-sm">{t.title}</span>
                    <span className="num shrink-0 text-[12px] text-fg-3">{formatDue(t.due_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center justify-between text-lg font-medium">
            Atividade recente
            <span className="flex items-center gap-1 text-[12px] font-normal text-fg-3">
              <Users size={13} aria-hidden /> {Number(s.new_contacts_30d ?? 0)} novos contatos em 30 dias
            </span>
          </h2>
          {(feedRes.data ?? []).length === 0 ? (
            <p className="text-[13px] text-fg-3">As movimentações dos negócios aparecem aqui.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {(feedRes.data ?? []).map((a) => (
                <li key={a.id} className="text-[13px]">
                  <p>
                    <span className="font-medium">{a.actor_id ? (person.get(a.actor_id) ?? "Alguém") : "Sistema"}</span> · {ACTIVITY_LABEL[a.kind] ?? a.kind}
                    {(a.kind === "stage_change" || a.kind === "won" || a.kind === "lost") && ` (${String((a.meta as Record<string, unknown>).from ?? "")} → ${String((a.meta as Record<string, unknown>).to ?? "")})`}
                  </p>
                  {a.deal_id && dealTitle.get(a.deal_id) && (
                    <Link href={`/funis?deal=${a.deal_id}`} className="text-[12px] text-fg-3">
                      {dealTitle.get(a.deal_id)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
