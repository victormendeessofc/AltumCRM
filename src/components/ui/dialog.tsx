"use client";
import * as RDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** "sheet" = painel inferior (mobile) */
  sheet?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * Modal centrado (origem no centro: modais não são ancorados a um gatilho).
 * Usa transições CSS, que são interruptíveis, em vez de keyframes.
 */
export function Dialog({ open, onOpenChange, title, description, sheet, children, className }: DialogProps) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-sm transition-opacity duration-200 ease-out data-[state=closed]:opacity-0 starting:data-[state=open]:opacity-0" />
        <RDialog.Content
          className={cn(
            "fixed z-50 flex max-h-[85vh] flex-col overflow-hidden border border-line bg-overlay shadow-[var(--shadow-popover)]",
            "transition-[opacity,transform] duration-200 ease-[var(--ease-out)]",
            sheet
              ? "inset-x-0 bottom-0 rounded-t-[var(--radius-2xl)] data-[state=closed]:translate-y-full starting:data-[state=open]:translate-y-full"
              : "left-1/2 top-1/2 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-2xl)] data-[state=closed]:scale-95 data-[state=closed]:opacity-0 starting:data-[state=open]:scale-95 starting:data-[state=open]:opacity-0",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 p-6 pb-3">
            <div className="min-w-0">
              <RDialog.Title className="text-xl font-medium leading-tight">{title}</RDialog.Title>
              <RDialog.Description className={cn("mt-1 text-[13px] text-fg-2", !description && "sr-only")}>
                {description ?? title}
              </RDialog.Description>
            </div>
            <RDialog.Close
              aria-label="Fechar"
              className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-2 transition-[background-color,color,transform] duration-[160ms] ease-out hover:bg-hover hover:text-fg active:scale-[0.97]"
            >
              <X size={18} aria-hidden />
            </RDialog.Close>
          </div>
          <div className="overflow-y-auto p-6 pt-3">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
