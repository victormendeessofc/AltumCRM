"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, fieldCls } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { deleteOrganization, updateOrganization, type OrgState } from "@/lib/org-actions";
import { useSubmit } from "@/lib/use-submit";

export function OrgSettings({ name, goal, isAdmin }: { name: string; goal: number; isAdmin: boolean }) {
  const [state, action, pending] = useSubmit(async (prev: OrgState | undefined, fd: FormData) => {
    const r = await updateOrganization(prev, fd);
    if (r.ok) toast.success("Organização atualizada");
    return r;
  });
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();

  if (!isAdmin) {
    return (
      <Card>
        <p className="text-fg-2">Somente administradores alteram as configurações da organização.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Dados da organização</h2>
        <form onSubmit={action} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da empresa">
              <input name="name" required defaultValue={name} maxLength={80} className={fieldCls} />
            </Field>
            <Field label="Meta mensal de vendas (R$)">
              <input name="monthlyGoal" inputMode="decimal" defaultValue={goal ? String(goal).replace(".", ",") : ""} placeholder="Ex.: 50.000" className={fieldCls} />
            </Field>
          </div>
          <p className="text-[13px] text-fg-3">A meta aparece na Central e é comparada com o total de negócios ganhos no mês.</p>
          <FormError message={state?.error} />
          <div>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="flex flex-col gap-3 border-danger/30">
        <h2 className="text-lg font-medium text-danger">Zona de perigo</h2>
        <p className="text-[13px] text-fg-2">
          Excluir a organização apaga <b className="font-medium text-fg">todos</b> os contatos, negócios, tarefas, usuários e históricos. Não há como desfazer. Exporte seus contatos antes.
        </p>
        <div>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Excluir organização
          </Button>
        </div>
      </Card>

      <Dialog open={confirming} onOpenChange={setConfirming} title="Excluir organização?" description="Digite o nome exato da empresa para confirmar.">
        <div className="flex flex-col gap-4">
          <Field label={`Digite: ${name}`}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className={fieldCls} autoFocus autoComplete="off" />
          </Field>
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={busy || typed.trim() !== name}
              onClick={() =>
                start(async () => {
                  const r = await deleteOrganization(typed);
                  if (r?.error) setError(r.error);
                })
              }
            >
              {busy ? "Excluindo…" : "Excluir tudo"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
