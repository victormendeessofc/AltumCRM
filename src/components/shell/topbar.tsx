"use client";
import { LogOut, Moon, Search, Sun } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { signOut } from "@/lib/auth-actions";
import { applyTheme, useIsLight } from "@/lib/theme";
import { CommandPalette, OPEN_PALETTE_EVENT } from "./command-palette";
import { Notifications } from "./notifications";

export function Topbar({ userName, orgName }: { userName: string; orgName: string }) {
  const isLight = useIsLight();

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-2.5 rounded-[var(--radius-xl)] border border-line-subtle bg-card px-3 shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        className="flex h-12 min-w-0 max-w-[520px] flex-1 cursor-pointer items-center gap-2.5 rounded-full border border-line bg-raised pl-4 pr-2 text-left text-fg-3 transition-[border-color,color] duration-[160ms] ease-out hover:border-line-strong hover:text-fg-2"
      >
        <Search size={18} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Buscar contatos, negócios e tarefas…</span>
        <kbd className="hidden items-center rounded-[9px] border border-line bg-card px-2 py-1 text-[11px] font-medium text-fg-3 sm:inline-flex">Ctrl K</kbd>
      </button>
      <div className="flex-1" />
      <IconButton icon={isLight ? Moon : Sun} label={isLight ? "Usar tema escuro" : "Usar tema claro"} size="lg" onClick={() => applyTheme(isLight ? "escuro" : "claro")} />
      <Notifications />
      <Link href="/perfil" aria-label="Meu perfil" className="flex min-w-0 items-center gap-2.5 rounded-2xl no-underline">
        <span className="hidden min-w-0 flex-col text-right leading-tight lg:flex">
          <span className="truncate text-sm font-medium text-fg">{userName}</span>
          <span className="truncate text-[11px] text-fg-3">{orgName}</span>
        </span>
        <Avatar name={userName} size={40} shape="square" status="online" />
      </Link>
      <form action={signOut}>
        <IconButton icon={LogOut} label="Sair" size="lg" type="submit" />
      </form>
      <CommandPalette />
    </header>
  );
}
