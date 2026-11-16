"use client";
import * as RTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  value: string;
  label: string;
}

/** Tabs segmentadas. O conteúdo vem em children (use TabsContent) ou é controlado por quem usa via value. */
export function Tabs({
  items,
  value,
  onValueChange,
  children,
  className,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (v: string) => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RTabs.List className="inline-flex gap-1 rounded-full border border-line bg-raised p-1">
        {items.map((it) => (
          <RTabs.Trigger
            key={it.value}
            value={it.value}
            className={cn(
              "h-8 cursor-pointer rounded-full px-4 text-[13px] font-medium text-fg-2",
              "transition-[background-color,color] duration-[160ms] ease-out hover:text-fg",
              "data-[state=active]:bg-selected data-[state=active]:text-fg",
            )}
          >
            {it.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}

export const TabsContent = RTabs.Content;
