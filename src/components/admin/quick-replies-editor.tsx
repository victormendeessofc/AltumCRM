"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, fieldCls, textareaCls } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { normalizeShortcut, type QuickReply } from "@/lib/quick-replies";
import { createQuickReply, deleteQuickReply, updateQuickReply } from "@/lib/quick-reply-actions";

export function QuickRepliesEditor({ items, canEdit }: { items: QuickReply[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);
  const [removing, setRemoving] = useState<QuickReply | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Respostas rápidas</h2>
            <p className="max-w-[62ch] text-[13px] text-fg-2">
              Textos prontos para a equipe usar nas Conversas: digite <b className="font-medium text-fg">/</b> e o atalho (ex.: <span className="num">/preco</span>) na caixa de mensagem. Use{" "}
              <span className="num">{"{{primeiro_nome}}"}</span> ou <span className="num">{"{{nome}}"}</span> para inserir o nome do cliente.
            </p>
          </div>
          {canEdit && (
            <Button variant="primary" iconLeft={Plus} onClick={() => setEditing("new")}>
              Nova resposta
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="rounded-2xl bg-raised px-4 py-6 text-center text-[13px] text-fg-3">
            {canEdit ? "Nenhuma resposta cadastrada. Comece pelas perguntas que mais chegam: preço, endereço, horário." : "Nenhuma resposta cadastrada ainda. Peça a um gerente ou administrador."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
            {items.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="num rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-fg">/{r.shortcut}</span>
                    <span className="font-medium">{r.title}</span>
                  </p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] text-fg-3">{r.body}</p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" iconLeft={Pencil} onClick={() => setEditing(r)} aria-label={`Editar /${r.shortcut}`}>
                      <span className="hidden sm:inline">Editar</span>
                    </Button>
                    <Button size="sm" variant="ghost" iconLeft={Trash2} onClick={() => setRemoving(r)} aria-label={`Apagar /${r.shortcut}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && <EditDialog item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Apagar resposta rápida?" description={removing ? `O atalho /${removing.shortcut} deixa de funcionar para toda a equipe.` : undefined}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              removing &&
              start(async () => {
                const r = await deleteQuickReply(removing.id);
                if (r.error) toast.error(r.error);
                else toast.success("Resposta apagada");
                setRemoving(null);
              })
            }
          >
            {busy ? "Apagando…" : "Apagar"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function EditDialog({ item, onClose }: { item: QuickReply | null; onClose: () => void }) {
  const [error, setError] = useState<string>();
  const [shortcut, setShortcut] = useState(item?.shortcut ?? "");
  const [pending, start] = useTransition();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = item ? await updateQuickReply(item.id, fd) : await createQuickReply(undefined, fd);
      if (r.error) return setError(r.error);
      toast.success(item ? "Resposta atualizada" : "Resposta criada");
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={item ? "Editar resposta rápida" : "Nova resposta rápida"}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Atalho">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-3">/</span>
              <input
                name="shortcut"
                required
                value={shortcut}
                onChange={(e) => setShortcut(normalizeShortcut(e.target.value))}
                placeholder="preco"
                maxLength={30}
                autoComplete="off"
                autoFocus={!item}
                className={cn(fieldCls, "num pl-7")}
              />
            </div>
          </Field>
          <Field label="Nome">
            <input name="title" required defaultValue={item?.title} maxLength={80} placeholder="Tabela de preços" className={fieldCls} autoComplete="off" />
          </Field>
        </div>
        <Field label="Texto">
          <textarea name="body" required defaultValue={item?.body} maxLength={4096} rows={6} placeholder={"Olá {{primeiro_nome}}! A avaliação custa R$ ... e dura cerca de 40 minutos."} className={cn(textareaCls, "resize-y")} />
        </Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
