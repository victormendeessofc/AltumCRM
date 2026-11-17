"use client";
import { ArrowLeft, Check, CheckCheck, Clock, Plus, Search, Send, TriangleAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EntityPicker } from "@/components/ui/entity-picker";
import { Field, FormError, fieldCls, textareaCls } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import {
  assignConversation,
  createContactFromConversation,
  getThread,
  listConversations,
  markConversationRead,
  sendMessage,
  setConversationStatus,
  startConversation,
  type ActionState,
  type ConvFilter,
  type ConvStatus,
  type ConversationItem,
  type MessageItem,
} from "@/lib/conversation-actions";
import { useSubmit } from "@/lib/use-submit";
import { formatPhone } from "@/lib/whatsapp/phone";

export interface ChannelOption {
  id: string;
  name: string;
  status: string;
}
export interface Member {
  id: string;
  name: string;
}

const FILTERS: { value: ConvFilter; label: string }[] = [
  { value: "open", label: "Abertas" },
  { value: "mine", label: "Minhas" },
  { value: "pending", label: "Pendentes" },
  { value: "closed", label: "Encerradas" },
];

function clock(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  if (same) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 7) return d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

function Tick({ m }: { m: MessageItem }) {
  if (m.direction !== "out") return null;
  if (m.status === "failed") return <TriangleAlert size={13} className="text-danger" aria-label="Falhou" />;
  if (m.status === "queued") return <Clock size={13} aria-label="Enviando" />;
  if (m.status === "sent") return <Check size={13} aria-label="Enviada" />;
  if (m.status === "delivered") return <CheckCheck size={13} aria-label="Entregue" />;
  if (m.status === "read") return <CheckCheck size={13} className="text-info" aria-label="Lida" />;
  return null;
}

export function ConversationsView({
  initial,
  initialFilter,
  initialId,
  channels,
  members,
  meId,
}: {
  initial: ConversationItem[];
  initialFilter: ConvFilter;
  initialId: string | null;
  channels: ChannelOption[];
  members: Member[];
  meId: string;
}) {
  const [filter, setFilter] = useState<ConvFilter>(initialFilter);
  const [q, setQ] = useState("");
  const [list, setList] = useState<ConversationItem[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [conv, setConv] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string>();
  const [sending, startSend] = useTransition();
  const [creating, setCreating] = useState(false);
  const [busy, startBusy] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const person = new Map(members.map((m) => [m.id, m.name]));
  const connected = channels.filter((c) => c.status === "connected");

  const refreshList = useCallback(async () => {
    try {
      setList(await listConversations(filter, q));
    } catch {
      // sem rede: mantém a lista atual
    }
  }, [filter, q]);

  const refreshThread = useCallback(async (id: string) => {
    try {
      const t = await getThread(id);
      setConv(t.conversation);
      setMessages(t.messages);
    } catch {
      // sem rede: mantém o que já está na tela
    }
  }, []);

  // lista: recarrega ao mudar filtro/busca e a cada 8 s com a aba visível
  useEffect(() => {
    const first = setTimeout(refreshList, q ? 250 : 0);
    const t = setInterval(() => document.visibilityState === "visible" && refreshList(), 8000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refreshList, q]);

  // conversa aberta: carrega, marca como lida e atualiza a cada 4 s
  useEffect(() => {
    if (!selectedId) return;
    const id = selectedId;
    stick.current = true;
    const first = setTimeout(async () => {
      await refreshThread(id);
      await markConversationRead(id);
    }, 0);
    const t = setInterval(() => document.visibilityState === "visible" && refreshThread(id), 4000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [selectedId, refreshThread]);

  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const current = selectedId && conv?.id === selectedId ? conv : null;

  const send = () => {
    const text = draft.trim();
    if (!text || !selectedId) return;
    setSendError(undefined);
    stick.current = true;
    startSend(async () => {
      const r = await sendMessage(selectedId, text);
      if (r.error) setSendError(r.error);
      else setDraft("");
      await refreshThread(selectedId);
      refreshList();
    });
  };

  const act = (fn: () => Promise<ActionState>, ok?: string) =>
    startBusy(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (ok) toast.success(ok);
      if (selectedId) await refreshThread(selectedId);
      refreshList();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-tight">Conversas</h1>
          <p className="text-[13px] text-fg-2">Atenda os clientes pelo WhatsApp sem sair do CRM.</p>
        </div>
        <Button variant="primary" iconLeft={Plus} onClick={() => setCreating(true)} disabled={connected.length === 0}>
          Nova conversa
        </Button>
      </div>

      {channels.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-line-subtle bg-card px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-lg font-medium">Conecte um número de WhatsApp para começar</p>
          <p className="max-w-[48ch] text-[13px] text-fg-3">As mensagens dos clientes passam a chegar aqui, ligadas aos seus contatos e negócios.</p>
          <Link href="/whatsapp" className="inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-fg no-underline">
            Ir para WhatsApp
          </Link>
        </div>
      ) : (
        <div className="grid h-[calc(100dvh-230px)] min-h-[480px] overflow-hidden rounded-[var(--radius-xl)] border border-line-subtle bg-card shadow-[var(--shadow-card)] md:grid-cols-[340px_1fr]">
          {/* lista */}
          <section className={cn("flex min-h-0 flex-col border-line-subtle md:border-r", selectedId && "hidden md:flex")} aria-label="Lista de conversas">
            <div className="flex flex-col gap-3 p-3">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome ou número" className={cn(fieldCls, "pl-10")} aria-label="Buscar conversa" />
              </div>
              <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Filtrar conversas">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.value}
                    onClick={() => setFilter(f.value)}
                    className={cn(
                      "h-8 shrink-0 cursor-pointer rounded-full px-3.5 text-[13px] font-medium transition-[background-color,color] duration-[160ms] ease-out",
                      filter === f.value ? "bg-selected text-fg" : "text-fg-2 hover:text-fg",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {list.length === 0 && <li className="px-5 py-10 text-center text-[13px] text-fg-3">{q ? "Nada encontrado." : "Nenhuma conversa aqui."}</li>}
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    aria-current={c.id === selectedId ? "true" : undefined}
                    className={cn("flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-[background-color] duration-[120ms] ease-out hover:bg-hover", c.id === selectedId && "bg-selected")}
                  >
                    <Avatar name={c.name} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-sm", c.unread > 0 ? "font-semibold" : "font-medium")}>{c.name}</span>
                        <span className="num shrink-0 text-[11px] text-fg-3">{clock(c.lastAt)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] text-fg-3">{c.preview ?? "Sem mensagens"}</span>
                        {c.unread > 0 && <span className="num inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg">{c.unread}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* conversa */}
          <section className={cn("flex min-h-0 min-w-0 flex-col", !selectedId && "hidden md:flex")} aria-label="Conversa">
            {!selectedId || !current ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-[13px] text-fg-3">{selectedId ? "Carregando…" : "Escolha uma conversa à esquerda."}</div>
            ) : (
              <>
                <header className="flex flex-wrap items-center gap-3 border-b border-line-subtle px-4 py-3">
                  <button type="button" onClick={() => setSelectedId(null)} aria-label="Voltar para a lista" className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-fg-2 hover:bg-hover md:hidden">
                    <ArrowLeft size={18} aria-hidden />
                  </button>
                  <Avatar name={current.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 truncate text-base font-medium">
                      {current.name}
                      <Badge tone="neutral">{current.channelName}</Badge>
                    </p>
                    <p className="num text-[12px] text-fg-3">{formatPhone(current.phone)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {current.contactId ? (
                      <Link href={`/contatos?q=${encodeURIComponent(current.name)}`} className="inline-flex h-8 items-center rounded-full border border-line bg-raised px-3 text-[13px] text-fg no-underline hover:border-line-strong">
                        Ver contato
                      </Link>
                    ) : (
                      <Button size="sm" iconLeft={UserPlus} disabled={busy} onClick={() => act(() => createContactFromConversation(current.id), "Contato criado")}>
                        Criar contato
                      </Button>
                    )}
                    <select
                      aria-label="Responsável"
                      value={current.assigneeId ?? ""}
                      disabled={busy}
                      onChange={(e) => act(() => assignConversation(current.id, e.target.value || null))}
                      className="h-8 max-w-[160px] cursor-pointer rounded-full border border-line bg-raised px-3 text-[13px] text-fg outline-none focus:border-accent"
                    >
                      <option value="">Sem responsável</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id === meId ? "Eu" : m.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Status da conversa"
                      value={current.status}
                      disabled={busy}
                      onChange={(e) => act(() => setConversationStatus(current.id, e.target.value as ConvStatus))}
                      className="h-8 cursor-pointer rounded-full border border-line bg-raised px-3 text-[13px] text-fg outline-none focus:border-accent"
                    >
                      <option value="open">Aberta</option>
                      <option value="pending">Pendente</option>
                      <option value="closed">Encerrada</option>
                    </select>
                  </div>
                </header>

                <div
                  className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                  }}
                >
                  {messages.length === 0 && <p className="py-10 text-center text-[13px] text-fg-3">Nenhuma mensagem ainda. Escreva abaixo para começar.</p>}
                  <ul className="flex flex-col gap-2">
                    {messages.map((m) => (
                      <li key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[min(80%,520px)] rounded-2xl px-3.5 py-2 text-sm", m.direction === "out" ? "rounded-br-md bg-accent-soft text-fg" : "rounded-bl-md bg-raised text-fg")}>
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className="num mt-1 flex items-center justify-end gap-1 text-[11px] text-fg-3">
                            {m.direction === "out" && m.senderId && m.senderId !== meId && <span>{person.get(m.senderId)?.split(" ")[0]} ·</span>}
                            {clock(m.createdAt)} <Tick m={m} />
                          </p>
                          {m.status === "failed" && m.error && <p className="mt-1 text-[12px] text-danger">{m.error}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div ref={bottom} />
                </div>

                <footer className="border-t border-line-subtle p-3">
                  {!current.windowOpen ? (
                    <p className="rounded-2xl bg-warning-soft px-4 py-3 text-[13px] text-warning">
                      Passaram mais de 24 horas desde a última mensagem do cliente. A API oficial do WhatsApp só permite enviar um modelo de mensagem aprovado nesse caso. Aguarde o cliente escrever de novo.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {sendError && <FormError message={sendError} />}
                      <div className="flex items-end gap-2">
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                              e.preventDefault();
                              send();
                            }
                          }}
                          rows={1}
                          maxLength={4096}
                          placeholder="Escreva uma mensagem (Enter envia, Shift+Enter quebra a linha)"
                          aria-label="Mensagem"
                          className={cn(textareaCls, "max-h-40 min-h-11 flex-1 resize-none rounded-[22px] py-2.5")}
                        />
                        <Button variant="primary" size="lg" iconLeft={Send} onClick={send} disabled={sending || !draft.trim()} aria-label="Enviar mensagem">
                          <span className="hidden sm:inline">{sending ? "Enviando…" : "Enviar"}</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </footer>
              </>
            )}
          </section>
        </div>
      )}

      <NewConversationDialog
        open={creating}
        onClose={() => setCreating(false)}
        channels={connected}
        onStarted={(id) => {
          setCreating(false);
          setFilter("open");
          setSelectedId(id);
          refreshList();
        }}
      />
    </div>
  );
}

function NewConversationDialog({ open, onClose, channels, onStarted }: { open: boolean; onClose: () => void; channels: ChannelOption[]; onStarted: (id: string) => void }) {
  const [state, onSubmit, pending] = useSubmit(async (prev: ActionState | undefined, fd: FormData) => {
    const r = await startConversation(prev, fd);
    if (r.ok && r.id) onStarted(r.id);
    return r;
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Nova conversa" description="Informe o número do cliente. Na API oficial, o WhatsApp só deixa responder depois que o cliente escrever primeiro.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Canal">
          <select name="channelId" required defaultValue={channels[0]?.id} className={cn(fieldCls, "cursor-pointer")}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Telefone (com DDD)">
          <input name="phone" required inputMode="tel" placeholder="(11) 91234-5678" className={fieldCls} autoComplete="off" />
        </Field>
        <Field label="Nome (opcional)">
          <input name="name" maxLength={120} className={fieldCls} autoComplete="off" />
        </Field>
        <Field label="Contato do CRM (opcional)">
          <EntityPicker kind="contact" name="contactId" placeholder="Buscar contato…" />
        </Field>
        <FormError message={state?.error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Abrindo…" : "Abrir conversa"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
