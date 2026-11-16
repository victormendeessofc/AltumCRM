"use client";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NavItem } from "@/components/ui/nav-item";
import { NAV, isActive } from "@/lib/nav";
import { cn } from "@/lib/cn";

const KEY = "altum:sidebar-collapsed";
const listeners = new Set<() => void>();

function readCollapsed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function setCollapsed(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

  return (
    <aside
      className={cn(
        "relative hidden shrink-0 transition-[width] duration-[280ms] ease-[var(--ease-in-out)] md:block",
        collapsed ? "w-[84px]" : "w-[264px]",
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        title={collapsed ? "Expandir menu" : "Recolher menu"}
        className="absolute -right-3.5 top-9 z-10 inline-flex size-[26px] cursor-pointer items-center justify-center rounded-full border border-line-strong bg-raised text-fg-2 shadow-[var(--shadow-tile)] transition-[color,border-color,transform] duration-[160ms] ease-out hover:border-accent hover:text-fg active:scale-[0.95]"
      >
        {collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronLeft size={14} aria-hidden />}
      </button>

      <nav
        aria-label="Navegação principal"
        className="flex h-full flex-col gap-1 overflow-y-auto overflow-x-hidden rounded-[var(--radius-xl)] border border-line-subtle bg-card p-3 pt-4 shadow-[var(--shadow-card)] [scrollbar-width:none]"
      >
        <div className={cn("flex items-center px-1 pb-3", collapsed ? "justify-center" : "justify-start")}>
          {collapsed ? (
            <><Image src="/brand/altum-mark-claro.svg" alt="Altum CRM" width={36} height={22} className="mark-dark-only" priority /><Image src="/brand/altum-mark-escuro.svg" alt="Altum CRM" width={36} height={22} className="mark-light-only" priority /></>
          ) : (
            <>
              <Image src="/brand/altum-logo-horizontal-claro.png" alt="Altum CRM" width={160} height={53} className="logo-dark-only h-auto w-[160px]" priority />
              <Image src="/brand/altum-logo-horizontal-escuro.png" alt="Altum CRM" width={160} height={53} className="logo-light-only h-auto w-[160px]" priority />
            </>
          )}
        </div>

        {NAV.map((g) => (
          <div key={g.group} className="flex flex-col gap-0.5 pt-3">
            {collapsed ? (
              <span className="mx-3 mb-2 h-px bg-line" />
            ) : (
              <span className="px-3.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-fg-3">{g.group}</span>
            )}
            {g.items.map((it) =>
              it.soon ? (
                <span
                  key={it.href}
                  aria-disabled="true"
                  title={collapsed ? `${it.label} (em breve)` : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-medium text-fg-off",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <it.icon size={19} aria-hidden />
                  {!collapsed && (
                    <>
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      <span className="rounded-full bg-hover px-2 py-0.5 text-[10px] font-medium text-fg-3">em breve</span>
                    </>
                  )}
                </span>
              ) : (
                <NavItem key={it.href} href={it.href} icon={it.icon} label={it.label} active={isActive(pathname, it.href)} collapsed={collapsed} />
              ),
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
