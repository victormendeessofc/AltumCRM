import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const fieldCls =
  "h-11 w-full rounded-full border border-line bg-raised px-4 text-sm text-fg outline-none transition-[border-color,box-shadow] duration-[160ms] ease-out placeholder:text-fg-3 focus:border-accent focus:shadow-[var(--focus-ring)]";

export const textareaCls =
  "w-full rounded-3xl border border-line bg-raised px-4 py-3 text-sm font-normal text-fg outline-none transition-[border-color,box-shadow] duration-[160ms] ease-out placeholder:text-fg-3 focus:border-accent focus:shadow-[var(--focus-ring)]";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-[13px] font-medium text-fg-2", className)}>
      {label}
      {children}
    </label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
      {message}
    </p>
  );
}
