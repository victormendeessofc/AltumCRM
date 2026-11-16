"use client";
import { usePathname } from "next/navigation";
import { NavItem } from "@/components/ui/nav-item";
import { NAV, isActive } from "@/lib/nav";

const KEYS = ["/painel", "/funis", "/contatos", "/tarefas", "/admin"];

/** Barra inferior no mobile: só rotas já construídas. */
export function TabBar() {
  const pathname = usePathname();
  const items = NAV.flatMap((g) => g.items).filter((i) => KEYS.includes(i.href));
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-40 flex gap-0.5 rounded-3xl border border-line bg-[color-mix(in_srgb,var(--surface-card)_88%,transparent)] p-1.5 shadow-[var(--shadow-popover)] backdrop-blur-xl md:hidden"
    >
      {items.map((i) => (
        <NavItem key={i.href} href={i.href} icon={i.icon} label={i.label === "Funis de vendas" ? "Funis" : i.label === "Administração" ? "Admin" : i.label} active={isActive(pathname, i.href)} layout="stacked" />
      ))}
    </nav>
  );
}
