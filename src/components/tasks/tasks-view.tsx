"use client";
import { Check, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EntityPicker } from "@/components/ui/entity-picker";
import { Field, FormError, fieldCls, textareaCls } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { deleteTask, saveTask, toggleTask, type TaskState } from "@/lib/task-actions";
import { dueBucket, formatDue, fromDueIso, type DueBucket } from "@/lib/tasks";

export interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  doneAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  contactId: string | null;
  contactName: string | null;
  createdBy: string | null;
}
export interface MemberOpt {
  id: string;
  name: string;
}

export type TabKey = "hoje" | "atrasadas" | "proximas" | "sem-prazo" | "concluidas";
const TABS: { key: TabKey; label: string; match: DueBucket }[] = [
  { key: "hoje", label: "Hoje", match: "today" },
  { key: "atrasadas", label: "Atrasadas", match: "overdue" },
  { key: "proximas", label: "Próximas", match: "upcoming" },
  { key: "sem-prazo", label: "Sem prazo", match: "none" },
  { key: "concluidas", label: "Concluídas", match: "done" },
];

function TaskForm({ task, members, meId, canDelete, onDone }: { task: TaskRow | null; members: MemberOpt[]; meId: string; canDelete: boolean; onDone: () => void }) {
  const due = fromDueIso(task?.dueAt ?? null);
  const [state, action, pending] = useActionState(async (prev: TaskState | undefined, fd: FormData) => {
    const r = await saveTask(prev, fd);
    if (r.ok) {
      toast.success(task ? "Tarefa atualizada" : "Tarefa criada");
      onDone();
    }
    return r;
  }, undefined);
  const [busy, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-4">
      {task && <input type="hidden" name="id" value={task.id} />}
      <Field label="O que precisa ser feito? *">
        <input name="title" required autoFocus defaultValue={task?.title ?? ""} maxLength={200} className={fieldCls} placeholder="Ex.: Ligar para confirmar a proposta" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Data">
          <input name="dueDate" type="date" defaultValue={due.date} className={fieldCls} />
        </Field>
        <Field label="Hora (opcional)">
          <input name="dueTime" type="time" defaultValue={due.time} className={fieldCls} />
        </Field>
        <Field label="Responsável">
          <select name="assigneeId" defaultValue={task ? (task.assigneeId ?? "") : meId} className={fieldCls + " cursor-pointer"}>
            <option value="">Sem responsável</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Negócio vinculado">
          <EntityPicker kind="deal" name="dealId" placeholder="Buscar negócio…" initial={task?.dealId ? { id: task.dealId, label: task.dealTitle ?? "Negócio", hint: "" } : null} />
        </Field>
        <Field label="Contato vinculado">
          <EntityPicker kind="contact" name="contactId" placeholder="Buscar contato…" initial={task?.contactId ? { id: task.contactId, label: task.contactName ?? "Contato", hint: "" } : null} />
        </Field>
      </div>
      <Field label="Observações">
        <textarea name="notes" rows={3} maxLength={5000} defaultValue={task?.notes ?? ""} className={textareaCls} />
      </Field>
      <FormError message={state?.error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {task && canDelete ? (
          confirm ? (
            <span className="flex items-center gap-2 text-[13px] text-fg-2">
              Excluir mesmo?
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const r = await deleteTask(task.id);
                    if (r.error) toast.error(r.error);
                    else {
                      toast.success("Tarefa excluída");
                      onDone();
                    }
                  })
                }
              >
                Sim, excluir
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                Não
              </Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" iconLeft={Trash2} onClick={() => setConfirm(true)}>
              Excluir
            </Button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function TasksView({
  tasks,
  tab,
  scope,
  q,
  members,
  meId,
  openNew,
}: {
  tasks: TaskRow[];
  tab: TabKey;
  scope: "mine" | "all";
  q: string;
  members: MemberOpt[];
  meId: string;
  openNew: boolean;
}) {
  const [optimistic, setDone] = useOptimistic(tasks, (state, p: { id: string; done: boolean }) =>
    state.map((t) => (t.id === p.id ? { ...t, doneAt: p.done ? new Date().toISOString() : null } : t)),
  );
  const [, start] = useTransition();
  const [editing, setEditing] = useState<TaskRow | "new" | null>(openNew ? "new" : null);

  const bucketOf = (t: TaskRow) => dueBucket(t);
  const counts = Object.fromEntries(TABS.map((t) => [t.key, optimistic.filter((x) => bucketOf(x) === t.match).length])) as Record<TabKey, number>;
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const list = optimistic
    .filter((t) => bucketOf(t) === current.match)
    .sort((a, b) => (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"));

  const href = (patch: Record<string, string>) => {
    const sp = new URLSearchParams({ ...(tab !== "hoje" ? { v: tab } : {}), ...(scope === "all" ? { m: "all" } : {}), ...(q ? { q } : {}), ...patch });
    for (const [k, v] of [...sp]) if (!v) sp.delete(k);
    const s = sp.toString();
    return s ? `/tarefas?${s}` : "/tarefas";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-tight">Tarefas</h1>
          <p className="num text-[13px] text-fg-2">
            {counts.hoje} para hoje · {counts.atrasadas} atrasadas
          </p>
        </div>
        <Button variant="primary" iconLeft={Plus} onClick={() => setEditing("new")}>
          Nova tarefa
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Período" className="flex flex-wrap gap-1 rounded-full border border-line bg-raised p-1">
          {TABS.map((t) => (
            <Link key={t.key} href={href({ v: t.key === "hoje" ? "" : t.key })} aria-current={t.key === tab ? "true" : undefined} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium no-underline", t.key === tab ? "bg-selected text-fg" : "text-fg-2 hover:text-fg")}>
              {t.label}
              {counts[t.key] > 0 && <span className={cn("num text-[11px]", t.key === "atrasadas" ? "text-danger" : "text-fg-3")}>{counts[t.key]}</span>}
            </Link>
          ))}
        </nav>
        <nav aria-label="Responsável" className="flex gap-1 rounded-full border border-line bg-raised p-1">
          {(
            [
              ["mine", "Minhas"],
              ["all", "Da equipe"],
            ] as const
          ).map(([k, label]) => (
            <Link key={k} href={href({ m: k === "all" ? "all" : "" })} aria-current={scope === k ? "true" : undefined} className={cn("inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium no-underline", scope === k ? "bg-selected text-fg" : "text-fg-2 hover:text-fg")}>
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <Card className="p-2 md:p-3">
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <p className="text-lg font-medium">{tab === "concluidas" ? "Nada concluído ainda" : tab === "atrasadas" ? "Nenhuma tarefa atrasada" : "Tudo em dia"}</p>
            <p className="max-w-sm text-[13px] text-fg-2">{tab === "hoje" ? "Nada marcado para hoje. Que tal agendar o próximo follow-up?" : "Não há tarefas nesta lista."}</p>
          </div>
        ) : (
          <ul>
            {list.map((t) => {
              const b = bucketOf(t);
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-[background-color] duration-[120ms] ease-out hover:bg-hover">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={!!t.doneAt}
                    aria-label={t.doneAt ? `Reabrir: ${t.title}` : `Concluir: ${t.title}`}
                    onClick={() =>
                      start(async () => {
                        setDone({ id: t.id, done: !t.doneAt });
                        const r = await toggleTask(t.id, !t.doneAt);
                        if (r.error) toast.error(r.error);
                      })
                    }
                    className={cn(
                      "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-[background-color,border-color,transform] duration-[160ms] ease-out active:scale-90",
                      t.doneAt ? "border-accent bg-accent text-accent-fg" : "border-line-strong hover:border-accent",
                    )}
                  >
                    {t.doneAt && <Check size={14} aria-hidden />}
                  </button>
                  <button type="button" onClick={() => setEditing(t)} className="flex min-w-0 flex-1 cursor-pointer flex-col text-left">
                    <span className={cn("truncate font-medium", t.doneAt && "text-fg-3 line-through")}>{t.title}</span>
                    <span className="flex flex-wrap items-center gap-x-3 text-[12px] text-fg-3">
                      <span className={cn(b === "overdue" && "text-danger", b === "today" && "text-warning")}>{formatDue(t.dueAt)}</span>
                      {t.dealTitle && <span className="truncate">Negócio: {t.dealTitle}</span>}
                      {t.contactName && <span className="truncate">Contato: {t.contactName}</span>}
                    </span>
                  </button>
                  {t.assigneeName && <Avatar name={t.assigneeName} size={26} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Nova tarefa" : "Editar tarefa"} className="w-[min(94vw,640px)]">
        {editing !== null && <TaskForm key={editing === "new" ? "new" : editing.id} task={editing === "new" ? null : editing} members={members} meId={meId} canDelete onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
