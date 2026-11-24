"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { QuickReply } from "@/lib/quick-replies";

/** Lista de respostas rápidas que abre acima da caixa de mensagem. Estado e teclado ficam na tela de Conversas. */
export function QuickReplyMenu({ items, active, empty, onPick, onHover }: { items: QuickReply[]; active: number; empty: "none" | "nomatch" | null; onPick: (r: QuickReply) => void; onHover: (i: number) => void }) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-line bg-overlay shadow-[var(--shadow-popover)]">
      {empty === "none" ? (
        <p className="px-4 py-3 text-[13px] text-fg-3">
          Nenhuma resposta rápida cadastrada.{" "}
          <Link href="/admin?tab=respostas" className="text-accent">
            Cadastrar
          </Link>
        </p>
      ) : empty === "nomatch" ? (
        <p className="px-4 py-3 text-[13px] text-fg-3">Nenhum atalho com esse nome.</p>
      ) : (
        <ul ref={list} role="listbox" aria-label="Respostas rápidas" className="max-h-64 overflow-y-auto p-1">
          {items.map((r, i) => (
            <li key={r.id} data-i={i} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // mantém o foco na caixa de mensagem
                onClick={() => onPick(r)}
                onMouseEnter={() => onHover(i)}
                className={cn("flex w-full cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2 text-left", i === active ? "bg-selected" : "hover:bg-hover")}
              >
                <span className="flex items-baseline gap-2 text-[13px]">
                  <span className="num font-medium text-fg">/{r.shortcut}</span>
                  <span className="truncate text-fg-2">{r.title}</span>
                </span>
                <span className="line-clamp-1 text-[12px] text-fg-3">{r.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line-subtle px-4 py-1.5 text-[11px] text-fg-3">↑ ↓ para escolher · Enter ou Tab insere · Esc fecha</p>
    </div>
  );
}
