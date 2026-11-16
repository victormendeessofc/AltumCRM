import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface NavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  active?: boolean;
  collapsed?: boolean;
  /** "stacked" = ícone sobre o rótulo (tab bar mobile) */
  layout?: "row" | "stacked";
}

export function NavItem({ href, icon: Icon, label, badge, active, collapsed, layout = "row" }: NavItemProps) {
  const stacked = layout === "stacked";
  const compact = collapsed || stacked;
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-2xl text-sm font-medium no-underline",
        "transition-[background-color,color,transform] duration-[160ms] ease-out active:scale-[0.98]",
        stacked ? "h-14 flex-1 flex-col justify-center gap-1 text-[11px]" : "h-11 gap-3 px-3.5",
        collapsed && !stacked && "justify-center px-0",
        active ? "bg-selected text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
      )}
    >
      <Icon size={stacked ? 20 : 19} className={active ? "text-accent" : undefined} aria-hidden />
      {(!collapsed || stacked) && <span className={cn("truncate", !stacked && "min-w-0 flex-1 text-left")}>{label}</span>}
      {badge ? (
        <span
          className={cn(
            "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-fg",
            compact && "absolute right-1.5 top-1.5",
          )}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
