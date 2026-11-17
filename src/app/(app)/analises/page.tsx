import { CircleDollarSign, Clock, Handshake, MessagesSquare, Percent, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { PERIODS, barWidth, formatDays, formatDuration, formatPct, monthLabel, parsePeriod, type Overview } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { formatBRL, formatBRLCompact } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Análises" };

const n = (v: number | string | null | undefined) => Number(v ?? 0);

function Kpi({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-line-subtle bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2 text-[13px] text-fg-2">
        <span className="inline-flex size-8 items-center justify-center rounded-xl border border-line bg-raised text-accent">{icon}</span>
        {label}
      </div>
      <p className="num text-[28px] font-medium leading-none">{value}</p>
      {hint && <p className="mt-2 text-[12px] text-fg-3">{hint}</p>}
    </div>
  );
}

/** Barras horizontais de uma única série (cor de destaque do app). O valor fica sempre escrito ao lado. */
function HBars({ rows, empty }: { rows: { key: string; label: string; value: number; display: string; hint?: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-[13px] text-fg-3">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate">
              {r.label} {r.hint && <span className="num text-fg-3">· {r.hint}</span>}
            </span>
            <span className="num shrink-0 text-fg-2">{r.display}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[rgb(var(--ink)/0.08)]" role="img" aria-label={`${r.label}: ${r.display}`}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${barWidth(r.value, max)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Colunas da receita ganha por mês. Uma série, base zero, rótulo em cada coluna (são só seis). */
function MonthlyColumns({ data }: { data: Overview["by_month"] }) {
  const W = 600;
  const H = 220;
  const top = 26;
  const bottom = 30;
  const max = Math.max(1, ...data.map((d) => n(d.value)));
  const slot = W / data.length;
  const bw = Math.min(56, slot * 0.55);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Receita ganha por mês: ${data.map((d) => `${monthLabel(d.month)} ${formatBRL(n(d.value))}`).join(", ")}`} className="h-auto w-full">
      <line x1="0" x2={W} y1={H - bottom} y2={H - bottom} stroke="var(--border-default)" strokeWidth="1" />
      {data.map((d, i) => {
        const h = n(d.value) > 0 ? Math.max(4, ((H - top - bottom) * n(d.value)) / max) : 0;
        const x = i * slot + (slot - bw) / 2;
        const y = H - bottom - h;
        return (
          <g key={d.month}>
            {h > 0 && (
              <rect x={x} y={y} width={bw} height={h} rx="6" fill="var(--accent)">
                <title>{`${monthLabel(d.month)}: ${formatBRL(n(d.value))} (${d.count} ${d.count === 1 ? "negócio" : "negócios"})`}</title>
              </rect>
            )}
            {h > 0 && (
              <text x={x + bw / 2} y={y - 8} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">
                {formatBRLCompact(n(d.value)).replace("R$ ", "")}
              </text>
            )}
            <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize="12" fill="var(--text-tertiary)">
              {monthLabel(d.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function AnalisesPage({ searchParams }: PageProps<"/analises">) {
  const session = await requireSession();
  const sp = await searchParams;
  const days = parsePeriod(typeof sp.dias === "string" ? sp.dias : undefined);
  const supabase = await createClient();

  const [{ data }, { data: profiles }] = await Promise.all([
    supabase.rpc("analytics_overview", { p_org: session.org.id, p_days: days }),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const o = data as Overview | null;
  const person = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));

  const hasDeals = !!o && (o.created_count > 0 || o.won_count > 0 || o.lost_count > 0 || o.open_count > 0);
  const at = o?.atendimento;
  const hasChat = !!at && (at.conversations_open + at.conversations_pending + at.conversations_closed > 0);

  return (
    <div className="animate-in-up flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-tight">Análises</h1>
          <p className="text-[13px] text-fg-2">{session.org.name} · resultados dos últimos {days} dias</p>
        </div>
        <nav aria-label="Período" className="inline-flex gap-1 rounded-full border border-line bg-raised p-1">
          {PERIODS.map((p) => (
            <Link key={p} href={`/analises?dias=${p}`} aria-current={p === days ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-full px-4 text-[13px] font-medium no-underline transition-[background-color,color] duration-[160ms] ease-out", p === days ? "bg-selected text-fg" : "text-fg-2 hover:text-fg")}>
              {p === 365 ? "1 ano" : `${p} dias`}
            </Link>
          ))}
        </nav>
      </div>

      {!o ? (
        <Card className="text-[13px] text-fg-2">Não foi possível carregar as análises agora. Atualize a página. Se continuar, confira se a migração 6 foi aplicada no banco.</Card>
      ) : (
        <>
          {!hasDeals && (
            <Card className="bg-[image:var(--glow-celery)]">
              <p className="text-lg font-medium">Ainda não há dados para analisar</p>
              <p className="mt-1 text-[13px] text-fg-2">Crie negócios no <Link href="/funis">funil</Link> e feche alguns como ganhos ou perdidos. Os gráficos aparecem aqui automaticamente.</p>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<CircleDollarSign size={16} />} label="Receita ganha" value={formatBRLCompact(n(o.won_value))} hint={`${o.won_count} ${o.won_count === 1 ? "negócio ganho" : "negócios ganhos"}`} />
            <Kpi icon={<Percent size={16} />} label="Taxa de conversão" value={formatPct(o.win_rate)} hint={`${o.won_count} ganhos · ${o.lost_count} perdidos`} />
            <Kpi icon={<Handshake size={16} />} label="Ticket médio" value={o.avg_deal_value === null ? "—" : formatBRLCompact(n(o.avg_deal_value))} hint="Valor médio dos ganhos" />
            <Kpi icon={<Clock size={16} />} label="Ciclo de venda" value={formatDays(o.avg_cycle_days)} hint="Da criação ao fechamento" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card className="flex flex-col gap-3">
              <h2 className="text-lg font-medium">Receita ganha por mês</h2>
              <MonthlyColumns data={o.by_month} />
              <details className="text-[13px] text-fg-2">
                <summary className="cursor-pointer select-none text-fg-3 hover:text-fg">Ver como tabela</summary>
                <table className="mt-2 w-full text-left">
                  <thead className="text-fg-3">
                    <tr>
                      <th className="py-1 font-medium">Mês</th>
                      <th className="py-1 text-right font-medium">Negócios</th>
                      <th className="py-1 text-right font-medium">Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.by_month.map((m) => (
                      <tr key={m.month} className="border-t border-line-subtle">
                        <td className="py-1.5">{monthLabel(m.month)}</td>
                        <td className="num py-1.5 text-right">{m.count}</td>
                        <td className="num py-1.5 text-right">{formatBRL(n(m.value))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </Card>

            <Card className="flex flex-col gap-4">
              <h2 className="flex items-center gap-2 text-lg font-medium">
                <TrendingUp size={18} className="text-accent" aria-hidden /> Funil em aberto
              </h2>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <p className="text-fg-3">Em aberto</p>
                  <p className="num text-xl font-medium">{formatBRLCompact(n(o.open_value))}</p>
                  <p className="text-[12px] text-fg-3">{o.open_count} negócios</p>
                </div>
                <div>
                  <p className="text-fg-3">Ponderado</p>
                  <p className="num text-xl font-medium">{formatBRLCompact(n(o.open_weighted))}</p>
                  <p className="text-[12px] text-fg-3">valor × probabilidade</p>
                </div>
              </div>
              <HBars
                empty="Sem etapas abertas."
                rows={o.stages.map((s) => ({ key: s.id, label: s.name, value: n(s.value), display: formatBRL(n(s.value)), hint: `${s.count}${s.avg_days !== null && s.count > 0 ? ` · ${formatDays(s.avg_days)} na etapa` : ""}` }))}
              />
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <h2 className="text-lg font-medium">Desempenho por responsável</h2>
              {o.by_owner.length === 0 ? (
                <p className="text-[13px] text-fg-3">Sem negócios com responsável ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[460px] text-left text-[13px]">
                    <thead className="text-fg-3">
                      <tr>
                        <th className="py-1.5 font-medium">Pessoa</th>
                        <th className="py-1.5 text-right font-medium">Ganhos</th>
                        <th className="py-1.5 text-right font-medium">Receita</th>
                        <th className="py-1.5 text-right font-medium">Perdidos</th>
                        <th className="py-1.5 text-right font-medium">Em aberto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.by_owner.map((r) => {
                        const name = r.owner_id ? (person.get(r.owner_id) ?? "Ex-membro") : "Sem responsável";
                        return (
                          <tr key={r.owner_id ?? "none"} className="border-t border-line-subtle">
                            <td className="py-2">
                              <span className="flex items-center gap-2.5">
                                <Avatar name={name} size={28} />
                                <span className="truncate">{name}</span>
                              </span>
                            </td>
                            <td className="num py-2 text-right">{r.won_count}</td>
                            <td className="num py-2 text-right">{formatBRL(n(r.won_value))}</td>
                            <td className="num py-2 text-right">{r.lost_count}</td>
                            <td className="num py-2 text-right">
                              {r.open_count} <span className="text-fg-3">({formatBRLCompact(n(r.open_value))})</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="flex flex-col gap-4">
              <h2 className="text-lg font-medium">Por que perdemos negócios</h2>
              <HBars empty="Nenhum negócio perdido no período." rows={o.lost_reasons.map((r) => ({ key: r.reason, label: r.reason, value: r.count, display: `${r.count}` }))} />
            </Card>
          </div>

          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-medium">De onde vêm os negócios</h2>
              <p className="text-[13px] text-fg-3">Pela origem cadastrada no contato. Contatos sem origem aparecem como &quot;Sem origem&quot;.</p>
            </div>
            <HBars
              empty="Sem negócios no período."
              rows={o.by_source.map((s) => ({ key: s.source, label: s.source, value: n(s.won_value), display: formatBRL(n(s.won_value)), hint: `${s.created} criados · ${s.won_count} ganhos` }))}
            />
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card className="flex flex-col gap-4">
              <h2 className="flex items-center gap-2 text-lg font-medium">
                <MessagesSquare size={18} className="text-accent" aria-hidden /> Atendimento
              </h2>
              {!hasChat ? (
                <p className="text-[13px] text-fg-3">
                  Sem conversas ainda. Conecte um número em <Link href="/whatsapp">WhatsApp</Link> para acompanhar tempo de resposta e volume.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Abertas" value={String(at!.conversations_open)} hint={`${at!.conversations_pending} pendentes`} />
                  <Stat label="Novas no período" value={String(at!.conversations_new)} hint={`${at!.conversations_closed} encerradas`} />
                  <Stat label="Mensagens" value={String(at!.messages_in + at!.messages_out)} hint={`${at!.messages_in} recebidas · ${at!.messages_out} enviadas`} />
                  <Stat label="1ª resposta (média)" value={formatDuration(at!.avg_first_response_seconds)} hint={`${at!.answered_conversations} conversas respondidas`} />
                </div>
              )}
              {hasChat && n(at!.unread) > 0 && <p className="text-[13px] text-warning">{n(at!.unread)} mensagens não lidas aguardando resposta.</p>}
            </Card>

            <Card className="flex flex-col gap-4">
              <h2 className="text-lg font-medium">Tarefas e suporte</h2>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Concluídas" value={String(o.tasks.done_period)} hint={`nos últimos ${days} dias`} />
                <Stat label="Em aberto" value={String(o.tasks.open)} hint={o.tasks.overdue > 0 ? `${o.tasks.overdue} atrasadas` : "nenhuma atrasada"} tone={o.tasks.overdue > 0 ? "bad" : undefined} />
                <Stat label="Chamados abertos" value={String(at?.tickets_open ?? 0)} hint="Suporte interno" />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" }) {
  return (
    <div>
      <p className="text-[13px] text-fg-3">{label}</p>
      <p className={cn("num text-2xl font-medium leading-tight", tone === "bad" && "text-danger")}>{value}</p>
      {hint && <p className="text-[12px] text-fg-3">{hint}</p>}
    </div>
  );
}
