"use client";
import * as Popover from "@radix-ui/react-popover";
import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { listNotifications, markAllRead, markRead, type NotificationItem } from "@/lib/shell-actions";

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await listNotifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      // sem rede ou sessão expirada: mantém o que já tem
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) refresh();
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notificações, ${unread} não lidas` : "Notificações"}
          title="Notificações"
          className="relative inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-raised text-fg-2 transition-[transform,border-color,color] duration-[160ms] ease-out hover:border-line-strong hover:text-fg active:scale-[0.97]"
        >
          <Bell size={20} aria-hidden />
          {unread > 0 && <span className="absolute right-3 top-3 size-2.5 rounded-full bg-accent ring-2 ring-[var(--surface-raised)]" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          className="z-50 w-[min(92vw,380px)] origin-[var(--radix-popover-content-transform-origin)] rounded-3xl border border-line bg-overlay p-2 shadow-[var(--shadow-popover)] transition-[opacity,transform] duration-150 ease-[var(--ease-out)] data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0"
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-base font-medium">Notificações</span>
            {unread > 0 && (
              <button
                type="button"
                className="cursor-pointer text-[13px] text-accent-text hover:underline"
                onClick={async () => {
                  await markAllRead();
                  refresh();
                }}
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <BellOff size={22} className="text-fg-3" aria-hidden />
              <p className="text-sm font-medium">Nada por aqui ainda</p>
              <p className="text-[13px] text-fg-3">Você será avisado quando alguém atribuir um negócio ou tarefa a você.</p>
            </div>
          ) : (
            <ul className="flex max-h-[60vh] flex-col overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={async () => {
                      setOpen(false);
                      if (n.unread) await markRead(n.id);
                      if (n.link) router.push(n.link);
                      refresh();
                    }}
                    className={cn("flex w-full cursor-pointer items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-[background-color] duration-[120ms] ease-out hover:bg-hover", n.unread && "bg-accent-soft/40")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body && <span className="block truncate text-[13px] text-fg-2">{n.body}</span>}
                      <span className="block text-[12px] text-fg-3">{ago(n.createdAt)}</span>
                    </span>
                    {n.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Não lida" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
