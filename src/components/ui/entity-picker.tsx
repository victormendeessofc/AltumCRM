"use client";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { searchEntities, type PickItem } from "@/lib/shell-actions";
import { fieldCls } from "./field";

/**
 * Seletor com busca (contato ou negócio). Envia o id escolhido no campo oculto `name`.
 * Nunca carrega a lista inteira: busca no servidor conforme a pessoa digita.
 */
export function EntityPicker({
  kind,
  name,
  initial,
  placeholder,
}: {
  kind: "contact" | "deal";
  name: string;
  initial?: PickItem | null;
  placeholder?: string;
}) {
  const [selected, setSelected] = useState<PickItem | null>(initial ?? null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickItem[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seq = useRef(0);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    timer.current = setTimeout(async () => {
      const r = await searchEntities(kind, q);
      if (my === seq.current) setResults(r);
    }, q ? 250 : 0);
    return () => clearTimeout(timer.current);
  }, [q, open, kind]);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex h-11 items-center justify-between gap-2 rounded-full border border-line bg-raised pl-4 pr-2 text-sm">
          <span className="truncate">{selected.label}</span>
          <button
            type="button"
            aria-label="Remover seleção"
            onClick={() => setSelected(null)}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-3 hover:bg-hover hover:text-fg"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : (
        <>
          <input
            className={fieldCls}
            placeholder={placeholder ?? "Buscar…"}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
          />
          {open && results.length > 0 && (
            <ul id={listId} role="listbox" className="absolute left-0 right-0 top-12 z-20 max-h-56 overflow-y-auto rounded-2xl border border-line bg-overlay p-1 shadow-[var(--shadow-popover)]">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSelected(r);
                      setQ("");
                      setOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-hover"
                  >
                    <span className="truncate">{r.label}</span>
                    {r.hint && <span className="truncate text-[12px] text-fg-3">{r.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
