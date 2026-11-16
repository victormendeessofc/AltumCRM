import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[var(--radius-xl)] border border-line-subtle bg-card p-6 shadow-[var(--shadow-card)]", className)}
      {...rest}
    />
  );
}
