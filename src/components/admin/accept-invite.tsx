"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/lib/admin-actions";

export function AcceptInvite({ token }: { token: string }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptInvite(token);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? "Entrando…" : "Aceitar convite"}
      </Button>
    </div>
  );
}
