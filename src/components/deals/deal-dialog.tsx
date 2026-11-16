"use client";
import { Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EntityPicker } from "@/components/ui/entity-picker";
import { Field, FormError, fieldCls, textareaCls } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { ACTIVITY_LABEL, type StageLite } from "@/lib/deals";
import { addActivity, deleteDeal, getTimeline, moveDeal, saveDeal, type DealState, type TimelineItem } from "@/lib/deal-actions";
import { formatBRL } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

export interface DealRow {
  id: string;
  title: string;
  value: number;
  stageId: string;
  pipelineId: string;
  contactId: string | null;
  contactName: string | null;
  company: string | null;
  ownerId: string | null;
  ownerName: string | null;
  expectedClose: string | null;
  notes: string | null;
  stageChangedAt: string;
  lostReason: string | null;
}
export interface MemberOpt {
  id: string;
  name: string;
}

function when(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(".", "");
}

function Timeline({ dealId }: { dealId: string }) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [kind, setKind] = useState("note");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    getTimeline(dealId).then((r) => alive && setItems(r));
    return () => {
      alive = false;
    };
  }, [dealId, tick]);

  return (
    <section aria-label="Histórico" className="flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="text-[15px] font-medium">Histórico</h3>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Tipo de registro" value={kind} onChange={(e) => setKind(e.target.value)} className={fieldCls + " !h-10 !w-auto cursor-pointer"}>
          <option value="note">Nota</option>
          <option value="call">Ligação</option>
          <option value="meeting">Reunião</option>
          <option value="email">E-mail</option>
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="O que aconteceu?" aria-label="Registro" className={fieldCls + " !h-10 min-w-[180px] flex-1"} maxLength={5000} />
        <Button
          size="md"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              const r = await addActivity(dealId, kind, text);
              if (r.error) return void toast.error(r.error);
              setText("");
              setTick((t) => t + 1);
            })
          }
        >
          Registrar
        </Button>
      </div>
      {items === null ? (
        <p className="text-[13px] text-fg-3">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-fg-3">Nada registrado ainda.</p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-3 overflow-y-auto pr-1">
          {items.map((a) => (
            <li key={a.id} className="text-[13px]">
              <p className="text-fg-3">
                {when(a.createdAt)} · {a.actor ?? "Sistema"}
              </p>
              <p>
                <span className="font-medium">{ACTIVITY_LABEL[a.kind] ?? a.kind}</span>
                {a.kind === "stage_change" || a.kind === "won" || a.kind === "lost" ? ` — ${String(a.meta.from ?? "")} → ${String(a.meta.to ?? "")}` : ""}
                {a.body ? `: ${a.body}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DealDialog({
  open,
  onClose,
  deal,
  pipelineId,
  stages,
  defaultStageId,
  members,
  companies,
  meId,
  canDelete,
}: {
  open: boolean;
  onClose: () => void;
  deal: DealRow | null;
  pipelineId: string;
  stages: StageLite[];
  defaultStageId: string;
  members: MemberOpt[];
  companies: string[];
  meId: string;
  canDelete: boolean;
}) {
  const [state, action, pending] = useSubmit(async (prev: DealState | undefined, fd: FormData) => {
    const r = await saveDeal(prev, fd);
    if (r.ok) {
      toast.success(deal ? "Negócio atualizado" : "Negócio criado");
      onClose();
    }
    return r;
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={deal ? "Editar negócio" : "Novo negócio"} className="w-[min(94vw,680px)]">
      {open && (
        <div className="flex flex-col gap-5" key={deal?.id ?? "new"}>
          <form onSubmit={action} className="flex flex-col gap-4">
            {deal && <input type="hidden" name="id" value={deal.id} />}
            <input type="hidden" name="pipelineId" value={pipelineId} />
            <Field label="Nome do negócio *">
              <input name="title" required autoFocus defaultValue={deal?.title ?? ""} maxLength={160} className={fieldCls} placeholder="Ex.: Implantação ERP – Mercado Bom Preço" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valor (R$)">
                <input name="value" inputMode="decimal" defaultValue={deal ? String(deal.value).replace(".", ",") : ""} placeholder="0,00" className={fieldCls} />
              </Field>
              {deal ? (
                <Field label="Etapa">
                  <select
                    aria-label="Etapa"
                    value={deal.stageId}
                    className={fieldCls + " cursor-pointer"}
                    onChange={(e) => {
                      const to = stages.find((s) => s.id === e.target.value);
                      if (to?.kind === "lost") return void toast.info("Para marcar como perdido, arraste o cartão até Perdido para informar o motivo.");
                      start(async () => {
                        const r = await moveDeal(deal.id, e.target.value);
                        if (r.error) toast.error(r.error);
                        else toast.success(`Movido para ${to?.name}`);
                        onClose();
                      });
                    }}
                    disabled={busy}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Etapa">
                  <select name="stageId" defaultValue={defaultStageId} className={fieldCls + " cursor-pointer"}>
                    {stages
                      .filter((s) => s.kind === "open")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Field label="Contato">
                <EntityPicker kind="contact" name="contactId" placeholder="Buscar contato…" initial={deal?.contactId ? { id: deal.contactId, label: deal.contactName ?? "Contato", hint: "" } : null} />
              </Field>
              <Field label="Empresa">
                <input name="company" list="deal-companies" defaultValue={deal?.company ?? ""} className={fieldCls} maxLength={120} />
                <datalist id="deal-companies">
                  {companies.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="Responsável">
                <select name="ownerId" defaultValue={deal ? (deal.ownerId ?? "") : meId} className={fieldCls + " cursor-pointer"}>
                  <option value="">Sem responsável</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Previsão de fechamento">
                <input name="expectedClose" type="date" defaultValue={deal?.expectedClose ?? ""} className={fieldCls} />
              </Field>
            </div>
            <Field label="Observações">
              <textarea name="notes" rows={3} maxLength={5000} defaultValue={deal?.notes ?? ""} className={textareaCls} />
            </Field>
            {deal?.lostReason && <p className="text-[13px] text-fg-2">Motivo da perda: {deal.lostReason}</p>}
            <FormError message={state?.error} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {deal && canDelete ? (
                confirmDelete ? (
                  <span className="flex items-center gap-2 text-[13px] text-fg-2">
                    Excluir {formatBRL(deal.value)}?
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        start(async () => {
                          const r = await deleteDeal(deal.id);
                          if (r.error) toast.error(r.error);
                          else {
                            toast.success("Negócio excluído");
                            onClose();
                          }
                        })
                      }
                    >
                      Sim, excluir
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                      Não
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="ghost" iconLeft={Trash2} onClick={() => setConfirmDelete(true)}>
                    Excluir
                  </Button>
                )
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </div>
          </form>
          {deal && <Timeline dealId={deal.id} />}
        </div>
      )}
    </Dialog>
  );
}
