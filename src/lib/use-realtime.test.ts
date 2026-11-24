import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { batcher, type RealtimeEvent } from "./use-realtime";

const ev = (id: string): RealtimeEvent => ({ table: "messages", row: { id } });

describe("batcher (agrupa rajadas do tempo real)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("junta eventos próximos num único aviso, na ordem", () => {
    const flush = vi.fn();
    const b = batcher(250, flush);
    b.push(ev("1"));
    b.push(ev("2"));
    vi.advanceTimersByTime(249);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0].map((e: RealtimeEvent) => e.row.id)).toEqual(["1", "2"]);
  });

  it("depois de avisar, começa um lote novo", () => {
    const flush = vi.fn();
    const b = batcher(100, flush);
    b.push(ev("1"));
    vi.advanceTimersByTime(100);
    b.push(ev("2"));
    vi.advanceTimersByTime(100);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls[1][0]).toHaveLength(1);
  });

  it("cancel descarta o que estava na fila (tela fechada não recebe aviso)", () => {
    const flush = vi.fn();
    const b = batcher(100, flush);
    b.push(ev("1"));
    b.cancel();
    vi.advanceTimersByTime(500);
    expect(flush).not.toHaveBeenCalled();
  });
});
