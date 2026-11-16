"use client";
import * as RDialog from "@radix-ui/react-dialog";
import { Briefcase, CircleHelp, CornerDownLeft, LayoutGrid, ListChecks, Moon, Plus, Search, Settings, Sun, User, Users, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { searchAll, type SearchHit } from "@/lib/shell-actions";
import { applyTheme, useIsLight } from "@/lib/theme";

export const OPEN_PALETTE_EVENT = "altum:palette";

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CommandPalette() {
  const router = useRouter();
  const isLight = useIsLight();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [idx, setIdx] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchAll(q);
      if (my === seq.current) setHits(r);
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const commands = useMemo<Cmd[]>(
    () => [
      { id: "n-painel", group: "Ir para", label: "Central", icon: LayoutGrid, run: () => go("/painel") },
      { id: "n-funis", group: "Ir para", label: "Funis de vendas", icon: Briefcase, run: () => go("/funis") },
      { id: "n-contatos", group: "Ir para", label: "Contatos", icon: Users, run: () => go("/contatos") },
      { id: "n-tarefas", group: "Ir para", label: "Tarefas", icon: ListChecks, run: () => go("/tarefas") },
      { id: "n-admin", group: "Ir para", label: "Administração", icon: Settings, run: () => go("/admin") },
      { id: "n-perfil", group: "Ir para", label: "Meu perfil", icon: User, run: () => go("/perfil") },
      { id: "n-ajuda", group: "Ir para", label: "Ajuda", icon: CircleHelp, run: () => go("/ajuda") },
      { id: "a-contato", group: "Criar", label: "Novo contato", icon: Plus, run: () => go("/contatos?novo=1") },
      { id: "a-negocio", group: "Criar", label: "Novo negócio", icon: Plus, run: () => go("/funis?novo=1") },
      { id: "a-tarefa", group: "Criar", label: "Nova tarefa", icon: Plus, run: () => go("/tarefas?novo=1") },
      {
        id: "a-tema",
        group: "Preferências",
        label: isLight ? "Usar tema escuro" : "Usar tema claro",
        icon: isLight ? Moon : Sun,
        run: () => {
          applyTheme(isLight ? "escuro" : "claro");
          setOpen(false);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLight],
  );

  const term = norm(q.trim());
  const items: Cmd[] = [
    ...commands.filter((c) => !term || norm(c.label + " " + c.group).includes(term)),
    ...(term.length >= 2
      ? hits.map<Cmd>((h) => ({
          id: `${h.kind}-${h.id}`,
          group: h.kind === "contact" ? "Contatos" : h.kind === "deal" ? "Negócios" : "Tarefas",
          label: h.title,
          hint: h.subtitle,
          icon: h.kind === "contact" ? Users : h.kind === "deal" ? Briefcase : ListChecks,
          run: () => go(h.href),
        }))
      : []),
  ];
  const current = Math.min(idx, Math.max(0, items.length - 1));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[current]?.run();
    }
  };

  return (
    <RDialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQ("");
          setHits([]);
          setIdx(0);
        }
      }}
    >
      <RDialog.Portal>
        {/* Sem animação de entrada: a paleta é aberta por atalho de teclado, dezenas de vezes por dia. */}
        <RDialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-sm" />
        <RDialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[min(92vw,620px)] -translate-x-1/2 flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-line bg-overlay shadow-[var(--shadow-popover)]"
        >
          <RDialog.Title className="sr-only">Busca e comandos</RDialog.Title>
          <div className="flex items-center gap-3 border-b border-line px-5">
            <Search size={18} className="shrink-0 text-accent" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setIdx(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Buscar contatos, negócios, tarefas ou comandos…"
              aria-label="Buscar"
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-3 focus-visible:shadow-none"
            />
          </div>
          <ul role="listbox" aria-label="Resultados" className="overflow-y-auto p-2">
            {items.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-fg-3">Nada encontrado para “{q}”.</li>}
            {items.map((c, i) => (
              <li key={c.id} role="presentation">
                {(i === 0 || items[i - 1].group !== c.group) && <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.04em] text-fg-3">{c.group}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => setIdx(i)}
                  onClick={c.run}
                  className={cn("flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm", i === current ? "bg-selected" : "")}
                >
                  <c.icon size={16} className="shrink-0 text-fg-2" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="truncate text-[12px] text-fg-3">{c.hint}</span>}
                  {i === current && <CornerDownLeft size={14} className="shrink-0 text-fg-3" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
