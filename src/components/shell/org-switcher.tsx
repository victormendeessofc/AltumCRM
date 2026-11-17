"use client";
import * as Popover from "@radix-ui/react-popover";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { roleLabel, type OrgRole } from "@/lib/roles";
import { switchOrg } from "@/lib/shell-actions";

export interface OrgOption {
  id: string;
  name: string;
  role: OrgRole;
}

/** Só aparece para quem participa de mais de uma organização. */
export function OrgSwitcher({ orgs, activeId }: { orgs: OrgOption[]; activeId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (orgs.length < 2) return null;
  const active = orgs.find((o) => o.id === activeId) ?? orgs[0];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Organização atual: ${active.name}. Trocar de organização`}
          className="flex h-12 max-w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-full border border-line bg-raised pl-3.5 pr-3 text-sm font-medium text-fg transition-[border-color] duration-[160ms] ease-out hover:border-line-strong"
        >
          <Building2 size={17} className="shrink-0 text-accent" aria-hidden />
          <span className="hidden min-w-0 truncate sm:inline">{active.name}</span>
          <ChevronsUpDown size={15} className="shrink-0 text-fg-3" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          className="z-50 w-[min(92vw,320px)] origin-[var(--radix-popover-content-transform-origin)] rounded-3xl border border-line bg-overlay p-2 shadow-[var(--shadow-popover)] transition-[opacity,transform] duration-150 ease-[var(--ease-out)] data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0"
        >
          <p className="px-3 py-2 text-[12px] font-medium uppercase tracking-[0.04em] text-fg-3">Suas organizações</p>
          <ul className="flex flex-col">
            {orgs.map((o) => {
              const current = o.id === active.id;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    disabled={pending}
                    aria-current={current ? "true" : undefined}
                    onClick={() => {
                      if (current) return setOpen(false);
                      start(async () => {
                        await switchOrg(o.id);
                      });
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-[background-color] duration-[120ms] ease-out hover:bg-hover disabled:opacity-60",
                      current && "bg-accent-soft/40",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{o.name}</span>
                      <span className="block text-[12px] text-fg-3">{roleLabel(o.role)}</span>
                    </span>
                    {current && <Check size={16} className="shrink-0 text-accent" aria-label="Organização atual" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
