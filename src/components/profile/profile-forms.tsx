"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormError, fieldCls } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { changePassword, updateProfileName, type ProfileState } from "@/lib/profile-actions";
import { applyTheme, useThemePref, type ThemePref } from "@/lib/theme";
import { useSubmit } from "@/lib/use-submit";

export function ProfileForms({ name, email }: { name: string; email: string }) {
  const [nameState, nameAction, namePending] = useSubmit(async (p: ProfileState | undefined, fd: FormData) => {
    const r = await updateProfileName(p, fd);
    if (r.ok) toast.success(r.info ?? "Salvo");
    return r;
  });
  const [passState, passAction, passPending] = useSubmit(async (p: ProfileState | undefined, fd: FormData) => {
    const r = await changePassword(p, fd);
    if (r.ok) toast.success(r.info ?? "Salvo");
    return r;
  });
  const theme = useThemePref();
  const OPTIONS: { v: ThemePref; label: string; icon: typeof Sun }[] = [
    { v: "escuro", label: "Escuro", icon: Moon },
    { v: "claro", label: "Claro", icon: Sun },
    { v: "sistema", label: "Sistema", icon: Monitor },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Dados pessoais</h2>
        <form onSubmit={nameAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome">
              <input name="name" required defaultValue={name} maxLength={80} className={fieldCls} />
            </Field>
            <Field label="E-mail (não editável)">
              <input value={email} readOnly className={cn(fieldCls, "opacity-70")} />
            </Field>
          </div>
          <FormError message={nameState?.error} />
          <div>
            <Button type="submit" variant="primary" disabled={namePending}>
              {namePending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Aparência</h2>
        <div role="radiogroup" aria-label="Tema" className="flex flex-wrap gap-2">
          {OPTIONS.map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={theme === v}
              onClick={() => applyTheme(v)}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-5 text-sm font-medium transition-[background-color,border-color,transform] duration-[160ms] ease-out active:scale-[0.97]",
                theme === v ? "border-accent bg-accent-soft text-fg" : "border-line bg-raised text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              <Icon size={16} aria-hidden /> {label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Segurança</h2>
        <form onSubmit={passAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nova senha (mínimo 8 caracteres)">
              <input name="password" type="password" required autoComplete="new-password" className={fieldCls} />
            </Field>
            <Field label="Repita a nova senha">
              <input name="again" type="password" required autoComplete="new-password" className={fieldCls} />
            </Field>
          </div>
          <FormError message={passState?.error} />
          <div>
            <Button type="submit" disabled={passPending}>
              {passPending ? "Alterando…" : "Alterar senha"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
