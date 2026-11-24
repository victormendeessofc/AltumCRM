"use client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "./supabase/browser";

export interface RealtimeSource {
  /** Tabela do schema public (precisa estar na publicação supabase_realtime). */
  table: "conversations" | "messages" | "notifications";
  /** Filtro do Realtime, ex.: `org_id=eq.<uuid>`. O RLS já restringe; o filtro só evita tráfego à toa. */
  filter?: string;
}

type Row = Record<string, unknown>;
export type RealtimeEvent = { table: RealtimeSource["table"]; row: Row };

/** Junta rajadas de eventos (ex.: mensagem + atualização da conversa) num único aviso. */
export function batcher(delayMs: number, flush: (events: RealtimeEvent[]) => void) {
  let queue: RealtimeEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    push(e: RealtimeEvent) {
      queue.push(e);
      if (timer) return;
      timer = setTimeout(() => {
        const batch = queue;
        queue = [];
        timer = undefined;
        flush(batch);
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      queue = [];
    },
  };
}

/**
 * Assina mudanças (INSERT/UPDATE) nas tabelas informadas e chama `onChange` com os eventos agrupados.
 * Devolve `true` enquanto a assinatura está ativa: a tela usa isso para espaçar a consulta de reserva.
 */
export function useRealtime(sources: RealtimeSource[], onChange: (events: RealtimeEvent[]) => void, delayMs = 250): boolean {
  const [live, setLive] = useState(false);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  const key = sources.map((s) => `${s.table}:${s.filter ?? "*"}`).join("|");

  useEffect(() => {
    if (!key) return;
    const supabase = browserClient();
    const queue = batcher(delayMs, (events) => cb.current(events));
    let channel = supabase.channel(`rt:${key}:${Math.random().toString(36).slice(2)}`);
    for (const s of key.split("|")) {
      const [table, filter] = s.split(":") as [RealtimeSource["table"], string];
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter !== "*" ? { filter } : {}) },
        (p: RealtimePostgresChangesPayload<Row>) => queue.push({ table, row: (p.new && Object.keys(p.new).length ? p.new : p.old) as Row }),
      );
    }
    channel.subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      queue.cancel();
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [key, delayMs]);

  return live;
}
