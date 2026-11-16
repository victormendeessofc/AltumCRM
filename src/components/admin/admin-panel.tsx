"use client";
import { Check, Copy, Trash2, UserPlus, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { changeRole, inviteMember, removeMember, revokeInvite, type ActionResult } from "@/lib/admin-actions";
import { ROLES, roleLabel, type OrgRole } from "@/lib/roles";

export interface MemberRow {
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  isMe: boolean;
}
export interface InviteRow {
  id: string;
  email: string;
  role: OrgRole;
  token: string;
  expiresAt: string;
}

const selectCls =
  "h-9 cursor-pointer rounded-full border border-line bg-raised px-3 text-[13px] text-fg outline-none transition-[border-color] duration-[160ms] ease-out hover:border-line-strong focus:border-accent disabled:cursor-default disabled:opacity-60";

const iconBtn =
  "inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-fg-3 transition-[background-color,color,transform] duration-[160ms] ease-out hover:bg-danger-soft hover:text-danger active:scale-[0.95]";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (r?.error) toast.error(r.error);
      else if (ok) toast.success(ok);
    });
  return { pending, run };
}

function Members({ members, canEdit }: { members: MemberRow[]; canEdit: boolean }) {
  const { pending, run } = useRun();
  const [confirm, setConfirm] = useState<MemberRow | null>(null);

  return (
    <Card className="flex flex-col gap-2 p-4 md:p-6">
      <h2 className="px-2 pb-2 text-lg font-medium">
        Usuários <span className="num text-fg-3">· {members.length}</span>
      </h2>
      <ul className="flex flex-col">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 rounded-2xl px-2 py-3 hover:bg-hover">
            <Avatar name={m.name || m.email} size={40} shape="square" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {m.name || m.email} {m.isMe && <span className="text-[12px] font-normal text-fg-3">(você)</span>}
              </p>
              <p className="truncate text-[13px] text-fg-3">{m.email}</p>
            </div>
            {canEdit ? (
              <>
                <select
                  aria-label={`Papel de ${m.name || m.email}`}
                  className={selectCls}
                  value={m.role}
                  disabled={pending}
                  onChange={(e) => run(() => changeRole(m.userId, e.target.value), "Papel atualizado")}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={m.isMe ? "Sair da organização" : `Remover ${m.name || m.email}`}
                  title={m.isMe ? "Sair da organização" : "Remover"}
                  onClick={() => setConfirm(m)}
                  className={iconBtn}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </>
            ) : (
              <Badge>{roleLabel(m.role)}</Badge>
            )}
          </li>
        ))}
      </ul>

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.isMe ? "Sair da organização?" : "Remover usuário?"}
        description={
          confirm
            ? confirm.isMe
              ? "Você perde o acesso a esta organização."
              : `${confirm.name || confirm.email} perde o acesso imediatamente.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              const target = confirm!;
              setConfirm(null);
              run(() => removeMember(target.userId), "Usuário removido");
            }}
          >
            {confirm?.isMe ? "Sair" : "Remover"}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

function CopyLink({ link }: { link: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      iconLeft={done ? Check : Copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          toast.error("Não consegui copiar. Selecione e copie o link manualmente.");
        }
      }}
    >
      {done ? "Copiado" : "Copiar link"}
    </Button>
  );
}

function Invites({ invites, origin }: { invites: InviteRow[]; origin: string }) {
  const { pending, run } = useRun();
  const [state, action, sending] = useActionState(inviteMember, undefined);

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-medium">Convidar para a equipe</h2>
        <p className="text-[13px] text-fg-2">
          Gere um link e envie pelo WhatsApp ou e-mail. Ele só funciona para o e-mail informado e vale por 7 dias.
        </p>
      </div>

      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-[13px] font-medium text-fg-2">
          E-mail
          <input
            name="email"
            type="email"
            required
            placeholder="pessoa@empresa.com"
            className="h-10 rounded-full border border-line bg-raised px-4 text-sm font-normal text-fg outline-none transition-[border-color,box-shadow] duration-[160ms] ease-out placeholder:text-fg-3 focus:border-accent focus:shadow-[var(--focus-ring)]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-fg-2">
          Papel
          <select name="role" defaultValue="seller" className={selectCls + " h-10"}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" iconLeft={UserPlus} disabled={sending}>
          {sending ? "Gerando…" : "Gerar convite"}
        </Button>
      </form>

      {state?.error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
          {state.error}
        </p>
      )}
      {state?.link && (
        <div role="status" className="flex flex-col gap-2 rounded-2xl bg-accent-soft p-4">
          <p className="text-[13px] text-accent-text">
            Convite criado para <b className="font-medium">{state.email}</b>. Envie este link:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl bg-card px-3 py-2 text-[12px] text-fg-2">{state.link}</code>
            <CopyLink link={state.link} />
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="px-2 text-[13px] font-medium text-fg-2">Pendentes</h3>
          <ul>
            {invites.map((i) => {
              const link = `${origin}/convite/${i.token}`;
              const expired = new Date(i.expiresAt) < new Date();
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-hover">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="text-[12px] text-fg-3">
                      {roleLabel(i.role)} · {expired ? "expirado" : `vale até ${new Date(i.expiresAt).toLocaleDateString("pt-BR")}`}
                    </p>
                  </div>
                  {expired ? <Badge tone="warning">Expirado</Badge> : <CopyLink link={link} />}
                  <button
                    type="button"
                    aria-label={`Cancelar convite de ${i.email}`}
                    title="Cancelar convite"
                    disabled={pending}
                    onClick={() => run(() => revokeInvite(i.id), "Convite cancelado")}
                    className={iconBtn}
                  >
                    <X size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function AdminPanel({
  members,
  invites,
  canEdit,
  origin,
}: {
  members: MemberRow[];
  invites: InviteRow[];
  canEdit: boolean;
  origin: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <Invites invites={invites} origin={origin} />
      ) : (
        <Card>
          <p className="text-fg-2">Somente administradores podem convidar, remover ou mudar o papel de usuários.</p>
        </Card>
      )}
      <Members members={members} canEdit={canEdit} />
    </div>
  );
}
