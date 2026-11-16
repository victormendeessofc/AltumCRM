"use client";
import { useState, useTransition, type FormEvent } from "react";

/**
 * Envio de formulário com Server Action que NÃO apaga o que a pessoa digitou quando há erro.
 * (O `<form action>` do React 19 zera os campos ao terminar, o que faz perder o texto num erro de validação.)
 * Se a ação devolver `ok: true`, o formulário é limpo.
 */
export function useSubmit<S extends { ok?: boolean }>(fn: (prev: S | undefined, fd: FormData) => Promise<S>) {
  const [state, setState] = useState<S>();
  const [pending, start] = useTransition();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const next = await fn(state, fd);
      setState(next);
      if (next?.ok) form.reset();
    });
  };
  return [state, onSubmit, pending] as const;
}
