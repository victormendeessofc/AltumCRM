"use client";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { AlertTriangle, Plus } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, fieldCls } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { moveDeal } from "@/lib/deal-actions";
import { daysIn, isStalled, weighted, type StageLite } from "@/lib/deals";
import { formatBRL, formatBRLCompact } from "@/lib/money";
import { DealDialog, type DealRow, type MemberOpt } from "./deal-dialog";

export interface PipelineOpt {
  id: string;
  name: string;
}

function DealCard({ deal, kind, dragging }: { deal: DealRow; kind: StageLite["kind"]; dragging?: boolean }) {
  const stalled = isStalled(deal.stageChangedAt, kind);
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-line bg-raised p-3 text-left shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-[120ms] ease-out",
        dragging ? "border-accent shadow-[var(--shadow-popover)]" : "hover:border-line-strong",
        stalled && "border-l-2 border-l-warning",
      )}
    >
      <p className="line-clamp-2 text-sm font-medium leading-snug">{deal.title}</p>
      {(deal.company || deal.contactName) && <p className="truncate text-[12px] text-fg-3">{[deal.company, deal.contactName].filter(Boolean).join(" · ")}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="num text-[13px] font-medium">{formatBRL(deal.value)}</span>
        <span className="flex items-center gap-2">
          {stalled && (
            <span title={`Parado há ${daysIn(deal.stageChangedAt)} dias`} className="inline-flex items-center gap-1 text-[11px] text-warning">
              <AlertTriangle size={12} aria-hidden />
              {daysIn(deal.stageChangedAt)}d
            </span>
          )}
          {deal.ownerName && <Avatar name={deal.ownerName} size={22} />}
        </span>
      </div>
    </div>
  );
}

function DraggableDeal({ deal, kind, onOpen }: { deal: DealRow; kind: StageLite["kind"]; onOpen: (d: DealRow) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`${deal.title}, ${formatBRL(deal.value)}. Enter abre; espaço e setas movem.`}
      onClick={() => onOpen(deal)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(deal);
        else listeners?.onKeyDown?.(e);
      }}
      className={cn("cursor-grab touch-manipulation outline-none active:cursor-grabbing", isDragging && "opacity-30")}
    >
      <DealCard deal={deal} kind={kind} />
    </div>
  );
}

function Column({ stage, deals, onOpen, onAdd }: { stage: StageLite; deals: DealRow[]; onOpen: (d: DealRow) => void; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((a, d) => a + d.value, 0);
  const closed = stage.kind !== "open";
  return (
    <section
      ref={setNodeRef}
      aria-label={`Etapa ${stage.name}`}
      className={cn(
        "flex w-[280px] shrink-0 snap-start flex-col rounded-[var(--radius-xl)] border bg-card p-3 transition-[border-color,background-color] duration-[120ms] ease-out",
        isOver ? "border-accent bg-accent-soft" : "border-line-subtle",
        stage.kind === "lost" && "opacity-80",
      )}
    >
      <header className="flex items-start justify-between gap-2 px-1 pb-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <span
              className={cn("size-2 shrink-0 rounded-full", stage.kind === "won" ? "bg-success" : stage.kind === "lost" ? "bg-danger" : "bg-fg-3")}
              aria-hidden
            />
            <span className="truncate">{stage.name}</span>
            <span className="num text-fg-3">{deals.length}</span>
          </h3>
          <p className="num text-[12px] text-fg-3">
            {formatBRL(total)}
            {!closed && stage.probability > 0 && ` · ${stage.probability}%`}
          </p>
        </div>
        {!closed && (
          <button type="button" aria-label={`Novo negócio em ${stage.name}`} title="Novo negócio aqui" onClick={onAdd} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-fg-3 transition-[background-color,color] duration-[120ms] ease-out hover:bg-hover hover:text-fg">
            <Plus size={16} aria-hidden />
          </button>
        )}
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto pr-0.5" style={{ maxHeight: "calc(100dvh - 330px)" }}>
        {deals.map((d) => (
          <DraggableDeal key={d.id} deal={d} kind={stage.kind} onOpen={onOpen} />
        ))}
        {deals.length === 0 && <p className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-[12px] text-fg-3">Arraste negócios para cá</p>}
      </div>
    </section>
  );
}

export function FunisView({
  pipelines,
  pipelineId,
  stages,
  deals,
  members,
  companies,
  meId,
  canDelete,
  view,
  filter,
  openDealId,
  openNew,
}: {
  pipelines: PipelineOpt[];
  pipelineId: string;
  stages: StageLite[];
  deals: DealRow[];
  members: MemberOpt[];
  companies: string[];
  meId: string;
  canDelete: boolean;
  view: "kanban" | "lista";
  filter: "" | "mine" | "stalled";
  openDealId: string | null;
  openNew: boolean;
}) {
  const [optimistic, applyMove] = useOptimistic(deals, (state, m: { id: string; stageId: string }) =>
    state.map((d) => (d.id === m.id ? { ...d, stageId: m.stageId, stageChangedAt: new Date().toISOString() } : d)),
  );
  const [, startMove] = useTransition();
  const [editing, setEditing] = useState<{ deal: DealRow | null; stageId: string } | null>(() => {
    const first = stages.find((s) => s.kind === "open")?.id ?? stages[0]?.id ?? "";
    if (openDealId) {
      const d = deals.find((x) => x.id === openDealId);
      if (d) return { deal: d, stageId: d.stageId };
    }
    return openNew ? { deal: null, stageId: first } : null;
  });
  const [active, setActive] = useState<DealRow | null>(null);
  const [lostFor, setLostFor] = useState<{ deal: DealRow; stageId: string } | null>(null);
  const [reason, setReason] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const firstOpen = stages.find((s) => s.kind === "open")?.id ?? stages[0]?.id ?? "";

  const visible = optimistic.filter((d) => {
    const kind = stageById.get(d.stageId)?.kind ?? "open";
    if (filter === "mine") return d.ownerId === meId;
    if (filter === "stalled") return isStalled(d.stageChangedAt, kind);
    return true;
  });

  const doMove = (deal: DealRow, stageId: string, lostReason?: string) =>
    startMove(async () => {
      applyMove({ id: deal.id, stageId });
      const r = await moveDeal(deal.id, stageId, lostReason);
      if (r.error) toast.error(r.error);
      else {
        const to = stageById.get(stageId);
        toast.success(to?.kind === "won" ? `Negócio ganho: ${formatBRL(deal.value)}` : `Movido para ${to?.name}`);
      }
    });

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const deal = optimistic.find((d) => d.id === e.active.id);
    const to = e.over ? stageById.get(String(e.over.id)) : undefined;
    if (!deal || !to || to.id === deal.stageId) return;
    if (to.kind === "lost") {
      setReason("");
      setLostFor({ deal, stageId: to.id });
    } else doMove(deal, to.id);
  };

  const q = (patch: Record<string, string>) => {
    const sp = new URLSearchParams({ p: pipelineId, ...(view === "lista" ? { v: "lista" } : {}), ...(filter ? { f: filter } : {}), ...patch });
    for (const [k, v] of [...sp]) if (!v) sp.delete(k);
    return `/funis?${sp}`;
  };

  const open = visible.filter((d) => stageById.get(d.stageId)?.kind === "open");
  const openValue = open.reduce((a, d) => a + d.value, 0);
  const weightedValue = open.reduce((a, d) => a + weighted(d.value, stageById.get(d.stageId)?.probability ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-tight">Funis de vendas</h1>
          <p className="num text-[13px] text-fg-2">
            {formatBRLCompact(openValue)} em aberto · {formatBRLCompact(weightedValue)} ponderado · {open.length} negócios
          </p>
        </div>
        <Button variant="primary" iconLeft={Plus} onClick={() => setEditing({ deal: null, stageId: firstOpen })}>
          Novo negócio
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pipelines.length > 1 && (
          <nav aria-label="Funis" className="flex gap-1 rounded-full border border-line bg-raised p-1">
            {pipelines.map((p) => (
              <Link key={p.id} href={q({ p: p.id })} className={cn("inline-flex h-8 items-center rounded-full px-4 text-[13px] font-medium no-underline", p.id === pipelineId ? "bg-selected text-fg" : "text-fg-2 hover:text-fg")}>
                {p.name}
              </Link>
            ))}
          </nav>
        )}
        <nav aria-label="Filtros" className="flex gap-1 rounded-full border border-line bg-raised p-1">
          {(
            [
              ["", "Todos"],
              ["mine", "Meus"],
              ["stalled", "Parados"],
            ] as const
          ).map(([k, label]) => (
            <Link key={k} href={q({ f: k })} aria-current={filter === k ? "true" : undefined} className={cn("inline-flex h-8 items-center rounded-full px-4 text-[13px] font-medium no-underline", filter === k ? "bg-selected text-fg" : "text-fg-2 hover:text-fg")}>
              {label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Visualização" className="flex gap-1 rounded-full border border-line bg-raised p-1">
          {(
            [
              ["kanban", "Kanban"],
              ["lista", "Lista"],
            ] as const
          ).map(([k, label]) => (
            <Link key={k} href={q({ v: k === "lista" ? "lista" : "" })} aria-current={view === k ? "true" : undefined} className={cn("inline-flex h-8 items-center rounded-full px-4 text-[13px] font-medium no-underline", view === k ? "bg-selected text-fg" : "text-fg-2 hover:text-fg")}>
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {view === "kanban" ? (
        <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActive(optimistic.find((d) => d.id === e.active.id) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3">
            {stages.map((s) => (
              <Column
                key={s.id}
                stage={s}
                deals={visible.filter((d) => d.stageId === s.id)}
                onOpen={(d) => setEditing({ deal: d, stageId: d.stageId })}
                onAdd={() => setEditing({ deal: null, stageId: s.id })}
              />
            ))}
          </div>
          <DragOverlay>{active ? <DealCard deal={active} kind={stageById.get(active.stageId)?.kind ?? "open"} dragging /> : null}</DragOverlay>
        </DndContext>
      ) : (
        <Card className="p-2 md:p-3">
          {visible.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] text-fg-2">Nenhum negócio por aqui.</p>
          ) : (
            <ul>
              {visible.map((d) => {
                const st = stageById.get(d.stageId);
                return (
                  <li key={d.id}>
                    <button type="button" onClick={() => setEditing({ deal: d, stageId: d.stageId })} className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition-[background-color] duration-[120ms] ease-out hover:bg-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.title}</span>
                        <span className="block truncate text-[13px] text-fg-3">{[d.company, d.contactName].filter(Boolean).join(" · ") || "—"}</span>
                      </span>
                      <Badge tone={st?.kind === "won" ? "success" : st?.kind === "lost" ? "danger" : "neutral"}>{st?.name}</Badge>
                      <span className="num hidden w-28 text-right text-[13px] sm:block">{formatBRL(d.value)}</span>
                      <span className="hidden w-32 truncate text-right text-[13px] text-fg-2 md:block">{d.ownerName ?? "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <DealDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        deal={editing?.deal ?? null}
        pipelineId={pipelineId}
        stages={stages}
        defaultStageId={editing?.stageId ?? firstOpen}
        members={members}
        companies={companies}
        meId={meId}
        canDelete={canDelete}
      />

      <Dialog open={lostFor !== null} onOpenChange={(o) => !o && setLostFor(null)} title="Marcar como perdido" description={lostFor?.deal.title}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!lostFor) return;
            doMove(lostFor.deal, lostFor.stageId, reason);
            setLostFor(null);
          }}
        >
          <Field label="Motivo (opcional, ajuda a entender o funil)">
            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={fieldCls} placeholder="Ex.: preço, concorrente, sem orçamento" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setLostFor(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger">
              Marcar como perdido
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
