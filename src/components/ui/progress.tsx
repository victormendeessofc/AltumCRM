import { cn } from "@/lib/cn";

export function Progress({ value, max = 100, size = "md", className }: { value: number; max?: number; size?: "sm" | "md"; className?: string }) {
  const pct = Math.min(100, Math.max(0, max === 0 ? 0 : (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("w-full overflow-hidden rounded-full bg-[rgb(var(--ink)/0.1)]", size === "sm" ? "h-1" : "h-2", className)}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-[280ms] ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}
