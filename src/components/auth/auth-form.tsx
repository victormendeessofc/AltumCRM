"use client";
import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth-actions";

export interface Field {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}

/** Formulário com Server Action: mostra erro/aviso em texto e bloqueia o botão enquanto envia. */
export function AuthForm({
  action,
  fields,
  submit,
  footer,
  hidden,
}: {
  action: (state: FormState | undefined, fd: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  footer?: ReactNode;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <div className="flex flex-col gap-4">
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f, i) => (
        <label key={f.name} className="flex flex-col gap-1.5 text-[13px] font-medium text-fg-2">
          {f.label}
          <input
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            placeholder={f.placeholder}
            autoFocus={i === 0}
            required
            className="h-12 rounded-full border border-line bg-raised px-4 text-sm font-normal text-fg outline-none transition-[border-color,box-shadow] duration-[160ms] ease-out placeholder:text-fg-3 focus:border-accent focus:shadow-[var(--focus-ring)]"
          />
        </label>
      ))}
      {state?.error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
          {state.error}
        </p>
      )}
      {state?.info && (
        <p role="status" className="rounded-2xl bg-accent-soft px-4 py-2.5 text-[13px] text-accent-text">
          {state.info}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? "Aguarde…" : submit}
      </Button>
    </form>
      {footer && <div className="text-center text-[13px] text-fg-2">{footer}</div>}
    </div>
  );
}
