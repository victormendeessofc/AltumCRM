"use client";
import { LogOut, Moon, Search, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { signOut } from "@/lib/auth-actions";

type Theme = "escuro" | "claro";
const listeners = new Set<() => void>();

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "claro" : "escuro";
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function applyTheme(t: Theme) {
  if (t === "claro") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.setItem("altum:theme", JSON.stringify(t));
  } catch {}
  listeners.forEach((l) => l());
}

export function Topbar({ userName, orgName }: { userName: string; orgName: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "escuro" as Theme);
  const next: Theme = theme === "escuro" ? "claro" : "escuro";

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-3 rounded-[var(--radius-xl)] border border-line-subtle bg-card px-3 shadow-[var(--shadow-card)]">
      <button
        type="button"
        className="flex h-12 min-w-0 max-w-[520px] flex-1 cursor-pointer items-center gap-2.5 rounded-full border border-line bg-raised pl-4 pr-2 text-left text-fg-3 transition-[border-color,color] duration-[160ms] ease-out hover:border-line-strong hover:text-fg-2"
      >
        <Search size={18} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Buscar contatos, negócios e tarefas…</span>
        <kbd className="hidden items-center rounded-[9px] border border-line bg-card px-2 py-1 text-[11px] font-medium text-fg-3 sm:inline-flex">Ctrl K</kbd>
      </button>
      <div className="flex-1" />
      <IconButton
        icon={theme === "escuro" ? Sun : Moon}
        label={`Usar tema ${next}`}
        size="lg"
        onClick={() => applyTheme(next)}
      />
      <div className="hidden min-w-0 flex-col text-right leading-tight lg:flex">
        <span className="truncate text-sm font-medium">{userName}</span>
        <span className="truncate text-[11px] text-fg-3">{orgName}</span>
      </div>
      <Avatar name={userName} size={40} shape="square" status="online" />
      <form action={signOut}>
        <IconButton icon={LogOut} label="Sair" size="lg" type="submit" />
      </form>
    </header>
  );
}
