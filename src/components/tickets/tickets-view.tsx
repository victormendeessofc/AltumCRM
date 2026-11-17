"use client";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, fieldCls, textareaCls } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { addTicketComment, createTicket, deleteTicket, updateTicket, type TicketState } from "@/lib/ticket-actions";
import { useSubmit } from "@/lib/use-submit";

export type TicketStatus = "open" | "in_progress" | "resolved";
export type Priority = "low" | "normal" | "high";
export interface TicketRow {
  id: string;
  title: string;
  body: string | null;
  status: TicketStatus;
  priority: Priority;
  requesterId: string | null;
  assigneeId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
export interface CommentRow {
  id: string;
  body: string;
  authorId: string | null;
  createdAt: string;
}
export interface Member {
  id: string;
  name: string;
}
export type TicketFilter = "open" | "mine" | "in_progress" | "resolved";

const FILTERS: { value: TicketFilter; label: string }[] = [
  { value: "open", label: "Abertos" },
  { value: "in_progress", label: "Em andamento" },
  { value: "mine", label: "Meus" },
  { value: "resolved", label: "Resolvidos" },
];
const STATUS = { open: { label: "Aberto", tone: "info" }, in_progress: { label: "Em andamento", tone: "warning" }, resolved: { label: "Resolvido", tone: "success" } } as const;
const PRIORITY = { low: { label: "Baixa", tone: "neutral" }, normal: { label: "Normal", tone: "accent" }, high: { label: "Alta", tone: "danger" } } as const;

function when(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function TicketsView({
  tickets,
  filter,
  selected,
  comments,
  members,
  meId,
  canManage,
}: {
  tickets: TicketRow[];
  filter: TicketFilter;
  selected: TicketRow | null;
  comments: CommentRow[];
  members: Member[];
  meId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, start] = useTransition();
  const person = new Map(members.map((m) => [m.id, m.name]));
  const nameOf = (id: string | null) => (id ? (id === meId ? "Você" : (person.get(id) ?? "Ex-membro")) : "—");

  const href = (f: TicketFilter, t?: string) => `/suporte?f=${f}${t ? `&t=${t}` : ""}`;
  const mayEdit = !!selected && (canManage || selected.requesterId === meId || selected.assigneeId === meId);
  const mayDelete = !!selected && (canManage || selected.requesterId === meId);

  const run = (fn: () => Promise<TicketState>, ok?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else {
        if (ok) toast.success(ok);
        after?.();
      }
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-tight">Suporte interno</h1>
          <p className="text-[13px] text-fg-2">Peça ajuda ao time: dúvidas, problemas e pedidos ficam registrados aqui.</p>
        </div>
        <Button variant="primary" iconLeft={Plus} onClick={() => setCreating(true)}>
          Novo chamado
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <Card className={cn("flex flex-col gap-3 p-4", selected && "hidden lg:flex")}>
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={href(f.value)}
                className={cn("inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium no-underline transition-[background-color,color] duration-[160ms] ease-out", filter === f.value ? "bg-selected text-fg" : "text-fg-2 hover:text-fg")}
              >
                {f.label}
              </Link>
            ))}
          </div>
          {tickets.length === 0 ? (
            <p className="px-2 py-8 text-center text-[13px] text-fg-3">Nenhum chamado nesta lista.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={href(filter, t.id)} aria-current={selected?.id === t.id ? "true" : undefined} className={cn("flex flex-col gap-1.5 rounded-2xl px-3 py-2.5 no-underline transition-[background-color] duration-[120ms] ease-out hover:bg-hover", selected?.id === t.id && "bg-selected")}>
                    <span className="truncate text-sm font-medium text-fg">{t.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
                      <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
                      {t.priority !== "normal" && <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>}
                      <span className="num">{when(t.createdAt)}</span>
                      <span className="truncate">por {nameOf(t.requesterId)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected ? (
          <Card className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <Link href={href(filter)} aria-label="Voltar para a lista" className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-hover lg:hidden">
                <ArrowLeft size={18} aria-hidden />
              </Link>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-medium leading-snug">{selected.title}</h2>
                <p className="mt-1 text-[12px] text-fg-3">
                  Aberto por {nameOf(selected.requesterId)} em <span className="num">{when(selected.createdAt)}</span>
                  {selected.resolvedAt && <> · resolvido em <span className="num">{when(selected.resolvedAt)}</span></>}
                </p>
              </div>
              {mayDelete && (
                <Button size="sm" variant="danger" iconLeft={Trash2} onClick={() => setConfirmDelete(true)}>
                  Excluir
                </Button>
              )}
            </div>

            {selected.body && <p className="whitespace-pre-wrap break-words text-sm text-fg-2">{selected.body}</p>}

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Status">
                <select value={selected.status} disabled={!mayEdit || busy} onChange={(e) => run(() => updateTicket(selected.id, { status: e.target.value }), "Status atualizado")} className={cn(fieldCls, "cursor-pointer")}>
                  <option value="open">Aberto</option>
                  <option value="in_progress">Em andamento</option>
                  <option value="resolved">Resolvido</option>
                </select>
              </Field>
              <Field label="Prioridade">
                <select value={selected.priority} disabled={!mayEdit || busy} onChange={(e) => run(() => updateTicket(selected.id, { priority: e.target.value }))} className={cn(fieldCls, "cursor-pointer")}>
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                </select>
              </Field>
              <Field label="Responsável">
                <select value={selected.assigneeId ?? ""} disabled={!mayEdit || busy} onChange={(e) => run(() => updateTicket(selected.id, { assigneeId: e.target.value || null }))} className={cn(fieldCls, "cursor-pointer")}>
                  <option value="">Sem responsável</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id === meId ? "Eu" : m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {!mayEdit && <p className="text-[12px] text-fg-3">Só quem abriu o chamado, o responsável ou um gerente altera estes campos.</p>}

            <div className="flex flex-col gap-3 border-t border-line-subtle pt-4">
              <h3 className="text-base font-medium">Conversa</h3>
              {comments.length === 0 && <p className="text-[13px] text-fg-3">Nenhum comentário ainda.</p>}
              <ul className="flex flex-col gap-3">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <Avatar name={nameOf(c.authorId)} size={32} />
                    <div className="min-w-0 flex-1 rounded-2xl bg-raised px-3.5 py-2">
                      <p className="text-[12px] text-fg-3">
                        <span className="font-medium text-fg-2">{nameOf(c.authorId)}</span> · <span className="num">{when(c.createdAt)}</span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  run(() => addTicketComment(selected.id, comment), undefined, () => setComment(""));
                }}
                className="flex flex-col gap-2"
              >
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={5000} placeholder="Escreva um comentário…" aria-label="Comentário" className={textareaCls} />
                <div>
                  <Button type="submit" variant="primary" disabled={busy || !comment.trim()}>
                    {busy ? "Enviando…" : "Comentar"}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        ) : (
          <Card className="hidden items-center justify-center py-16 text-center text-[13px] text-fg-3 lg:flex">Escolha um chamado à esquerda ou abra um novo.</Card>
        )}
      </div>

      <NewTicketDialog open={creating} onClose={() => setCreating(false)} members={members} meId={meId} onCreated={(id) => { setCreating(false); router.push(href("open", id)); }} />
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Excluir este chamado?" description="Os comentários também serão apagados. Não há como desfazer.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              setConfirmDelete(false);
              run(() => deleteTicket(selected!.id), "Chamado excluído", () => router.push(href(filter)));
            }}
          >
            Excluir
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function NewTicketDialog({ open, onClose, members, meId, onCreated }: { open: boolean; onClose: () => void; members: Member[]; meId: string; onCreated: (id: string) => void }) {
  const [state, onSubmit, pending] = useSubmit(async (prev: TicketState | undefined, fd: FormData) => {
    const r = await createTicket(prev, fd);
    if (r.ok && r.id) {
      toast.success("Chamado aberto");
      onCreated(r.id);
    }
    return r;
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Novo chamado" description="Explique o que você precisa. Quanto mais detalhe, mais rápido o time resolve.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Assunto">
          <input name="title" required minLength={3} maxLength={160} placeholder="Ex.: Não consigo exportar contatos" className={fieldCls} autoComplete="off" />
        </Field>
        <Field label="Detalhes">
          <textarea name="body" rows={4} maxLength={5000} placeholder="O que aconteceu? O que você esperava?" className={textareaCls} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prioridade">
            <select name="priority" defaultValue="normal" className={cn(fieldCls, "cursor-pointer")}>
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
            </select>
          </Field>
          <Field label="Responsável (opcional)">
            <select name="assigneeId" defaultValue="" className={cn(fieldCls, "cursor-pointer")}>
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === meId ? "Eu" : m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <FormError message={state?.error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Abrindo…" : "Abrir chamado"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
