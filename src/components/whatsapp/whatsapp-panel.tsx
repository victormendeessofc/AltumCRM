"use client";
import { CircleAlert, Plug, Plus, QrCode, RefreshCw, Settings2, ShieldCheck, Smartphone, Trash2, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, fieldCls } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { useSubmit } from "@/lib/use-submit";
import { formatPhone } from "@/lib/whatsapp/phone";
import {
  checkChannel,
  connectQr,
  createChannel,
  deleteChannel,
  disconnectChannel,
  getSetupInfo,
  reconnectCloud,
  updateChannel,
  type SetupInfo,
  type WaState,
} from "@/lib/whatsapp-actions";

export interface ChannelRow {
  id: string;
  provider: "cloud" | "qr";
  name: string;
  phone: string | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  statusDetail: string | null;
}

const STATUS = {
  connected: { label: "Conectado", tone: "success" },
  connecting: { label: "Conectando", tone: "warning" },
  disconnected: { label: "Desconectado", tone: "neutral" },
  error: { label: "Com problema", tone: "danger" },
} as const;

export function WhatsappPanel({ channels, isAdmin, serverReady, metaMissing }: { channels: ChannelRow[]; isAdmin: boolean; serverReady: boolean; metaMissing: string[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [qrFor, setQrFor] = useState<ChannelRow | null>(null);
  const [reconnectFor, setReconnectFor] = useState<ChannelRow | null>(null);
  const [editing, setEditing] = useState<ChannelRow | null>(null);
  const [removing, setRemoving] = useState<ChannelRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  const run = (id: string, fn: () => Promise<WaState | { error?: string; status?: string; detail?: string }>, okMsg?: string) => {
    setBusyId(id);
    start(async () => {
      const r = await fn();
      setBusyId(null);
      if (r.error) toast.error(r.error);
      else if (okMsg) toast.success(okMsg);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-tight">WhatsApp</h1>
          <p className="text-[13px] text-fg-2">Conecte o número da empresa para atender os clientes em Conversas.</p>
        </div>
        {isAdmin && (
          <Button variant="primary" iconLeft={Plus} onClick={() => setCreating(true)} disabled={!serverReady}>
            Conectar número
          </Button>
        )}
      </div>

      {!serverReady && (
        <Card className="flex gap-3 border-warning/40">
          <CircleAlert size={20} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <div className="text-[13px] text-fg-2">
            <p className="text-base font-medium text-fg">Falta ativar o Atendimento no servidor</p>
            <p className="mt-1">
              Peça a quem administra a hospedagem para criar na Vercel a variável <b className="font-medium text-fg">ALTUM_INTERNAL_KEY</b> (um texto aleatório com 32 ou mais caracteres) e rodar uma vez no Supabase:{" "}
              <code className="rounded bg-raised px-1.5 py-0.5 text-[12px]">select public.set_internal_key(&apos;o-mesmo-texto&apos;);</code>. Depois, faça um novo deploy. O passo a passo está em docs/ATENDIMENTO.md.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-base font-medium">
            <ShieldCheck size={18} className="text-success" aria-hidden /> API oficial (Meta)
          </p>
          <p className="text-[13px] text-fg-2">
            Recomendada para a operação. Estável e permitida pelo WhatsApp. Exige uma conta Meta Business e um número dedicado. Você responde livremente por 24 horas depois da última mensagem do cliente; passado esse prazo, só com modelos de mensagem aprovados.
          </p>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-base font-medium">
            <QrCode size={18} className="text-accent" aria-hidden /> QR Code
          </p>
          <p className="text-[13px] text-fg-2">
            Conecta lendo o QR Code no celular, como no WhatsApp Web. Mais rápido de começar, sem limite de 24 horas, mas <b className="font-medium text-fg">não é oficial</b>: o WhatsApp pode bloquear o número. Use um chip dedicado, nunca o principal. Precisa de um servidor Evolution API.
          </p>
        </Card>
      </div>

      {channels.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Smartphone size={28} className="text-fg-3" aria-hidden />
          <p className="text-base font-medium">Nenhum número conectado</p>
          <p className="max-w-[46ch] text-[13px] text-fg-3">{isAdmin ? "Clique em Conectar número para começar." : "Peça a um administrador para conectar o WhatsApp da empresa."}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {channels.map((c) => {
            const st = STATUS[c.status];
            const busy = busyId === c.id;
            return (
              <li key={c.id}>
                <Card className="flex flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-lg font-medium">
                        {c.name}
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <Badge tone={c.provider === "cloud" ? "info" : "accent"}>{c.provider === "cloud" ? "API oficial" : "QR Code"}</Badge>
                      </p>
                      <p className="num mt-1 text-[13px] text-fg-2">{c.phone ? formatPhone(c.phone) : "Número ainda não confirmado"}</p>
                      {c.statusDetail && <p className={`mt-1 text-[13px] ${c.status === "error" ? "text-danger" : "text-fg-3"}`}>{c.statusDetail}</p>}
                    </div>
                    {isAdmin && (
                      <div className="flex flex-wrap items-center gap-2">
                        {c.provider === "qr" && c.status !== "connected" && (
                          <Button variant="primary" size="sm" iconLeft={QrCode} onClick={() => setQrFor(c)}>
                            Ler QR Code
                          </Button>
                        )}
                        {c.provider === "cloud" && (
                          <Button size="sm" variant={c.status === "error" ? "primary" : "secondary"} iconLeft={Plug} onClick={() => setReconnectFor(c)}>
                            Reconectar
                          </Button>
                        )}
                        <Button size="sm" iconLeft={RefreshCw} disabled={busy} onClick={() => run(c.id, () => checkChannel(c.id), "Status atualizado")}>
                          {busy ? "Verificando…" : "Verificar"}
                        </Button>
                        <Button size="sm" iconLeft={Settings2} onClick={() => setEditing(c)}>
                          Editar
                        </Button>
                        {c.provider === "qr" && c.status === "connected" && (
                          <Button size="sm" iconLeft={Unplug} disabled={busy} onClick={() => run(c.id, () => disconnectChannel(c.id), "Desconectado")}>
                            Desconectar
                          </Button>
                        )}
                        <Button size="sm" variant="danger" iconLeft={Trash2} onClick={() => setRemoving(c)}>
                          Excluir
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <NewChannelDialog open={creating} metaMissing={metaMissing} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); router.refresh(); }} />
      {qrFor && <QrDialog channel={qrFor} onClose={() => { setQrFor(null); router.refresh(); }} />}
      {reconnectFor && <ReconnectDialog channel={reconnectFor} onClose={() => { setReconnectFor(null); router.refresh(); }} />}
      {editing && <EditDialog channel={editing} onClose={() => { setEditing(null); router.refresh(); }} />}
      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Excluir este número?" description="As conversas e mensagens deste canal também serão apagadas. Não há como desfazer.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const id = removing!.id;
              setRemoving(null);
              run(id, () => deleteChannel(id), "Canal excluído");
            }}
          >
            Excluir canal
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- novo canal
function NewChannelDialog({ open, metaMissing, onClose, onCreated }: { open: boolean; metaMissing: string[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [provider, setProvider] = useState<"cloud" | "qr">("cloud");
  const [state, onSubmit, pending] = useSubmit(async (prev: WaState | undefined, fd: FormData) => {
    const r = await createChannel(prev, fd);
    if (r.ok && r.channelId) {
      if (r.warning) toast.warning(`Canal salvo, mas falta uma etapa: ${r.warning}`, { duration: 15_000 });
      else toast.success(provider === "cloud" ? "WhatsApp conectado" : "Canal criado");
      onCreated(r.channelId);
    }
    return r;
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Conectar número" description="Escolha como o WhatsApp da empresa será ligado ao Altum.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Tabs
          items={[
            { value: "cloud", label: "API oficial" },
            { value: "qr", label: "QR Code" },
          ]}
          value={provider}
          onValueChange={(v) => setProvider(v as "cloud" | "qr")}
        />
        <input type="hidden" name="provider" value={provider} />
        <Field label="Nome do canal">
          <input name="name" required maxLength={60} placeholder="Ex.: Comercial" className={fieldCls} />
        </Field>
        {provider === "cloud" ? (
          <>
            {metaMissing.length > 0 && (
              <p className="rounded-2xl bg-warning-soft px-4 py-3 text-[13px] text-warning">
                O app da Meta da Agência ainda não foi configurado no servidor (falta {metaMissing.join(" e ")} na Vercel). Veja docs/ATENDIMENTO.md.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID do número (Phone Number ID)">
                <input name="phone_number_id" required inputMode="numeric" placeholder="Ex.: 100234567890123" className={fieldCls} autoComplete="off" aria-invalid={state?.field === "phone_number_id" || undefined} />
              </Field>
              <Field label="ID da conta do WhatsApp Business">
                <input name="waba_id" required inputMode="numeric" placeholder="Ex.: 100234567890456" className={fieldCls} autoComplete="off" aria-invalid={state?.field === "waba_id" || undefined} />
              </Field>
            </div>
            <Field label="Token de acesso permanente">
              <input name="access_token" required type="password" placeholder="Cole o token do usuário do sistema" className={fieldCls} autoComplete="off" aria-invalid={state?.field === "access_token" || undefined} />
            </Field>
            <Field label="PIN de verificação em duas etapas (6 dígitos)">
              <input name="pin" inputMode="numeric" maxLength={6} pattern="\d{6}" placeholder="Obrigatório na primeira conexão do número" className={fieldCls} autoComplete="off" aria-invalid={state?.field === "pin" || undefined} />
            </Field>
            <details className="rounded-2xl bg-raised px-4 py-3 text-[13px] text-fg-2">
              <summary className="cursor-pointer font-medium text-fg">Onde encontro cada dado?</summary>
              <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5">
                <li>
                  <b className="font-medium text-fg">ID do número</b> e <b className="font-medium text-fg">ID da conta</b>: no app da Agência em developers.facebook.com, WhatsApp → Configuração da API (ou no WhatsApp Manager). São números longos, não o telefone.
                </li>
                <li>
                  <b className="font-medium text-fg">Token permanente</b>: Configurações do negócio → Usuários do sistema → escolha o usuário → Gerar token, no app da Agência, com as permissões whatsapp_business_management e whatsapp_business_messaging. O usuário precisa ter a conta do WhatsApp atribuída (Adicionar ativos → Contas do WhatsApp). O token de 24 horas da tela de testes não serve.
                </li>
                <li>
                  <b className="font-medium text-fg">PIN</b>: WhatsApp Manager → Números de telefone → Verificação em duas etapas. Se ainda não existir, crie lá.
                </li>
                <li>Ao salvar, o Altum confere o número, registra na API e liga a conta ao app da Agência. Não é preciso configurar webhook.</li>
              </ol>
            </details>
          </>
        ) : (
          <>
            <Field label="Endereço do servidor Evolution API">
              <input name="api_url" type="url" placeholder="https://evolution.suaempresa.com.br" className={fieldCls} autoComplete="off" />
            </Field>
            <Field label="Chave do servidor (apikey)">
              <input name="api_key" type="password" placeholder="Chave global do Evolution API" className={fieldCls} autoComplete="off" />
            </Field>
            <p className="text-[13px] text-fg-3">Se o servidor já estiver configurado na hospedagem do Altum, deixe os dois campos em branco. Depois de criar, clique em Ler QR Code.</p>
          </>
        )}
        <MetaError error={state?.error} detail={state?.detail} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? (provider === "cloud" ? "Conectando à Meta…" : "Criando…") : provider === "cloud" ? "Conectar" : "Criar canal"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- QR Code
function QrDialog({ channel, onClose }: { channel: ChannelRow; onClose: () => void }) {
  const [qr, setQr] = useState<string>();
  const [code, setCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const closed = useRef(false);

  useEffect(() => {
    closed.current = false;
    const load = async () => {
      const r = await connectQr(channel.id);
      if (closed.current) return;
      setLoading(false);
      if (r.error) return setError(r.error);
      setError(undefined);
      if (r.state === "open") {
        toast.success("WhatsApp conectado");
        onClose();
      } else {
        setQr(r.qr);
        setCode(r.pairingCode);
      }
    };
    load();
    const poll = setInterval(async () => {
      const r = await checkChannel(channel.id);
      if (!closed.current && r.status === "connected") {
        toast.success("WhatsApp conectado");
        onClose();
      }
    }, 3000);
    const renew = setInterval(load, 40_000); // o QR expira em cerca de um minuto
    return () => {
      closed.current = true;
      clearInterval(poll);
      clearInterval(renew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Ler QR Code" description={`Conectando ${channel.name}`}>
      <div className="flex flex-col items-center gap-4">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR Code para conectar o WhatsApp" width={260} height={260} className="rounded-2xl bg-white p-3" />
        ) : (
          <div className="flex size-[260px] items-center justify-center rounded-2xl border border-line bg-raised text-[13px] text-fg-3" aria-busy={loading}>
            {loading ? "Gerando QR Code…" : "QR Code indisponível"}
          </div>
        )}
        {code && (
          <p className="text-center text-[13px] text-fg-2">
            Ou use o código de pareamento: <b className="num font-medium text-fg">{code}</b>
          </p>
        )}
        <FormError message={error} />
        <ol className="list-decimal self-stretch pl-5 text-[13px] text-fg-2">
          <li>No celular, abra o WhatsApp do número que será conectado.</li>
          <li>Toque em Aparelhos conectados e depois em Conectar um aparelho.</li>
          <li>Aponte a câmera para este QR Code. A tela fecha sozinha quando conectar.</li>
        </ol>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- erro da Meta (texto + etapa/código para o suporte)
function MetaError({ error, detail }: { error?: string; detail?: string }) {
  if (!error) return null;
  return (
    <div className="flex flex-col gap-1">
      <FormError message={error} />
      {detail && <p className="num text-[11px] text-fg-3">{detail}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- reconectar (API oficial)
function ReconnectDialog({ channel, onClose }: { channel: ChannelRow; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<WaState>();
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Reconectar à Meta" description={`Refaz o registro do número e liga de novo a conta ao app da Agência (${channel.name}).`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await reconnectCloud(channel.id, pin);
            setResult(r);
            if (r.ok) {
              toast.success("WhatsApp reconectado");
              onClose();
            }
          });
        }}
      >
        <Field label="PIN de verificação em duas etapas (opcional)">
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="Informe se o número precisar ser registrado de novo" className={fieldCls} autoComplete="off" autoFocus />
        </Field>
        <p className="text-[13px] text-fg-3">Use quando o canal estiver com problema ou as mensagens pararem de chegar. Sem PIN, o Altum só refaz a ligação da conta ao app.</p>
        <MetaError error={result?.error} detail={result?.detail} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Reconectando…" : "Reconectar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- editar
function EditDialog({ channel, onClose }: { channel: ChannelRow; onClose: () => void }) {
  const [info, setInfo] = useState<SetupInfo | { error: string }>();
  useEffect(() => {
    let alive = true;
    getSetupInfo(channel.id).then((r) => alive && setInfo(r));
    return () => {
      alive = false;
    };
  }, [channel.id]);
  const configured = info && !("error" in info) ? info.configured : [];
  const [state, onSubmit, pending] = useSubmit(async (prev: WaState | undefined, fd: FormData) => {
    const r = await updateChannel(prev, fd);
    if (r.ok) {
      toast.success("Canal atualizado");
      onClose();
    }
    return r;
  });
  const has = (k: string) => configured.includes(k);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Editar canal" description="Campos em branco mantêm o valor atual. Os segredos já salvos nunca são exibidos.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={channel.id} />
        <Field label="Nome do canal">
          <input name="name" defaultValue={channel.name} maxLength={60} className={fieldCls} />
        </Field>
        {channel.provider === "cloud" ? (
          <>
            <Field label={`Token de acesso ${has("access_token") ? "(salvo — preencha para trocar)" : ""}`}>
              <input name="access_token" type="password" className={fieldCls} autoComplete="off" placeholder={has("access_token") ? "••••••••••" : ""} />
            </Field>
            <Field label={`ID da conta do WhatsApp Business ${has("waba_id") ? "(salvo — preencha para trocar)" : "(obrigatório para receber mensagens)"}`}>
              <input name="waba_id" inputMode="numeric" className={fieldCls} autoComplete="off" placeholder={has("waba_id") ? "••••••••••" : "Ex.: 100234567890456"} />
            </Field>
            <p className="text-[13px] text-fg-3">Depois de trocar o token ou a conta, clique em Reconectar no canal.</p>
          </>
        ) : (
          <>
            <Field label={`Endereço do servidor ${has("api_url") ? "(salvo — preencha para trocar)" : ""}`}>
              <input name="api_url" type="url" className={fieldCls} autoComplete="off" placeholder="https://evolution.suaempresa.com.br" />
            </Field>
            <Field label={`Chave do servidor ${has("api_key") ? "(salva — preencha para trocar)" : ""}`}>
              <input name="api_key" type="password" className={fieldCls} autoComplete="off" placeholder={has("api_key") ? "••••••••••" : ""} />
            </Field>
          </>
        )}
        <FormError message={state?.error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
