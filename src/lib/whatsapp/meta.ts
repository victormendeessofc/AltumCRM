// Conexão de um número pela API oficial, no modelo do wacrm (ArnasDon/wacrm, licença MIT,
// Copyright (c) Arnas Donauskas): verificar o número, conferir que ele pertence à conta WhatsApp Business (WABA),
// registrar com o PIN de duas etapas e inscrever a WABA no app da Meta. Erros traduzidos para o usuário,
// com a etapa, o código da Meta e o trace id para levar ao suporte.
import { GRAPH } from "./cloud";
import { safeFetch } from "./net";

export type MetaStep = "verify_number" | "waba_phone_numbers" | "register" | "subscribe_waba" | "subscribed_apps";
export type MetaField = "access_token" | "phone_number_id" | "waba_id" | "pin" | "meta_account" | null;

export class MetaError extends Error {
  constructor(
    message: string,
    readonly code: number | null = null,
    readonly subcode: number | null = null,
    readonly fbtraceId: string | null = null,
    readonly details: string | null = null,
    readonly network = false,
  ) {
    super(message);
  }
}

export interface MetaExplanation {
  /** Texto para a pessoa, dizendo o que corrigir. */
  summary: string;
  field: MetaField;
  /** "user": corrigir no formulário. "meta": depende da Meta (limite, bloqueio, instabilidade). */
  side: "user" | "meta";
  step: MetaStep;
  code: number | null;
  subcode: number | null;
  fbtraceId: string | null;
  metaMessage: string;
}

type Envelope = { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string; error_data?: { details?: string } } };

async function call<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await safeFetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  } catch (e) {
    throw new MetaError(e instanceof Error ? e.message : String(e), null, null, null, null, true);
  }
  const json = (await res.json().catch(() => ({}))) as T & Envelope;
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new MetaError(e.message ?? `Erro ${res.status} da Meta`, e.code ?? null, e.error_subcode ?? null, e.fbtrace_id ?? null, e.error_data?.details ?? null);
  }
  return json;
}

export interface PhoneInfo {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
}

export const verifyNumber = (phoneNumberId: string, token: string) =>
  call<PhoneInfo>(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`, token);

/** Números que pertencem à WABA (segue a paginação por até 5 páginas). */
export async function wabaNumbers(wabaId: string, token: string): Promise<PhoneInfo[]> {
  const out: PhoneInfo[] = [];
  let url: string | undefined = `${GRAPH}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`;
  for (let page = 0; url && page < 5; page++) {
    const data: { data?: PhoneInfo[]; paging?: { next?: string } } = await call(url, token);
    out.push(...(data.data ?? []));
    url = data.paging?.next?.startsWith(GRAPH.replace(/\/v[\d.]+$/, "")) ? data.paging.next : undefined;
  }
  return out;
}

/** Registra o número na Cloud API (precisa do PIN de duas etapas). "Já registrado" conta como sucesso. */
export async function registerNumber(phoneNumberId: string, token: string, pin: string): Promise<void> {
  try {
    await call(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/register`, token, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", pin }) });
  } catch (e) {
    if (e instanceof MetaError && /already.*registered/i.test(e.message)) return;
    throw e;
  }
}

/** Inscreve a WABA no app dono do token (o app da Agência). Pode repetir sem problema. */
export const subscribeWaba = (wabaId: string, token: string) => call(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, token, { method: "POST" });

/** Apps inscritos na WABA (para o "Testar conexão"). */
export async function subscribedApps(wabaId: string, token: string): Promise<{ id: string | null; name: string | null }[]> {
  const data = await call<{ data?: { whatsapp_business_api_data?: { id?: string; name?: string } }[] }>(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, token);
  return (data.data ?? []).map((a) => ({ id: a.whatsapp_business_api_data?.id ?? null, name: a.whatsapp_business_api_data?.name ?? null }));
}

// ------------------------------------------------------------------ tradução dos erros
const STEP: Record<MetaStep, string> = {
  verify_number: "ler o número",
  waba_phone_numbers: "listar os números da conta WhatsApp Business",
  register: "registrar o número",
  subscribe_waba: "inscrever a conta WhatsApp Business no app",
  subscribed_apps: "ler as inscrições da conta WhatsApp Business",
};
const TOKEN_HINT =
  "Gere um token permanente em Configurações do negócio → Usuários do sistema → Gerar token, com as permissões whatsapp_business_management e whatsapp_business_messaging, e cole no campo Token.";
const RATE = new Set([4, 17, 32, 613, 80007, 130429, 131048, 131056]);
const TEMPORARY = new Set([1, 2, 131000, 133004, 133016]);

export function explainMetaError(err: unknown, step: MetaStep, ctx: { phoneNumberId?: string; wabaId?: string } = {}): MetaExplanation {
  const e = err instanceof MetaError ? err : new MetaError(err instanceof Error ? err.message : String(err), null, null, null, null, true);
  const metaMessage = e.details ? `${e.message} (${e.details})` : e.message;
  const base = { step, code: e.code, subcode: e.subcode, fbtraceId: e.fbtraceId, metaMessage };
  const out = (summary: string, field: MetaField, side: "user" | "meta" = "user"): MetaExplanation => ({ summary, field, side, ...base });
  const numberSide = step === "verify_number" || step === "register";
  const target = numberSide ? { field: "phone_number_id" as const, noun: "ID do número", id: ctx.phoneNumberId } : { field: "waba_id" as const, noun: "ID da conta WhatsApp Business", id: ctx.wabaId };
  const named = target.id ? `${target.noun} ${target.id}` : `o ${target.noun}`;

  if (e.network) return out(`Não foi possível falar com a Meta ao ${STEP[step]}. Tente de novo em instantes.`, null, "meta");

  if (e.code === 190) {
    const why = e.subcode === 463 ? "O token de acesso expirou." : e.subcode === 460 || e.subcode === 467 ? "O token de acesso foi invalidado (senha trocada, sessão encerrada ou token refeito)." : "A Meta recusou o token de acesso.";
    return out(`${why} Tokens temporários da tela Configuração da API duram só 24 horas. ${TOKEN_HINT}`, "access_token");
  }
  if (e.code === 10 || (e.code !== null && e.code >= 200 && e.code <= 299)) {
    return out(
      `O token não tem permissão para ${STEP[step]}. O usuário do sistema precisa das permissões whatsapp_business_management e whatsapp_business_messaging E estar ligado a esta conta WhatsApp Business (Configurações do negócio → Usuários do sistema → Adicionar ativos → Contas do WhatsApp). Depois, gere um token novo.`,
      "access_token",
    );
  }
  if (e.code === 131005) {
    return out(`A Meta negou acesso ao ${STEP[step]}: a empresa dona do token não gerencia ${named}. Ligue o usuário do sistema a esta conta WhatsApp Business.`, "access_token");
  }
  const missing = e.code === 33 || (e.code === 100 && e.subcode === 33) || (e.code === 100 && /unsupported (get|post) request|does not exist|missing permissions|unknown path components/i.test(e.message));
  if (missing) {
    return out(`A Meta não encontrou ${named}, ou a empresa dona do token não é dona dele. Copie o ${target.noun} exatamente como aparece em Meta → WhatsApp → Configuração da API e confira se o token foi gerado no mesmo portfólio empresarial.`, target.field);
  }
  if (e.code === 133010) return out("Este número ainda não está registrado na API do WhatsApp. Informe o PIN de verificação em duas etapas e salve de novo para registrá-lo.", "pin");
  if (e.code === 133005 || e.code === 136025 || (e.code === 100 && step === "register" && /pin/i.test(e.message))) {
    return out("O PIN de verificação em duas etapas está errado. Use o PIN de 6 dígitos definido no WhatsApp Manager → Números de telefone → Verificação em duas etapas (ou redefina por lá) e salve de novo.", "pin");
  }
  if (e.code === 133008 || e.code === 133009) return out("A Meta bloqueou temporariamente novas tentativas de PIN deste número, depois de muitos erros. Aguarde um tempo antes de tentar de novo com o PIN certo.", "pin", "meta");
  if (e.code === 131031 || e.code === 368) {
    return out("A Meta restringiu ou bloqueou esta conta WhatsApp Business, e o Altum não consegue conectá-la. Veja o motivo e recorra em Meta Business Manager → Qualidade da conta (ou WhatsApp Manager → Visão geral).", "meta_account", "meta");
  }
  if (e.code !== null && RATE.has(e.code)) return out("A Meta está limitando as chamadas deste app ou desta conta no momento. Aguarde alguns minutos e tente de novo.", null, "meta");
  if (e.code !== null && TEMPORARY.has(e.code)) return out("A Meta teve uma instabilidade temporária. Tente de novo em instantes.", null, "meta");
  if (e.code === 100) return out(`A Meta recusou um dado ao ${STEP[step]}: ${e.message}. Confira se o ${target.noun} foi copiado certo (só dígitos, sem espaços).`, target.field);
  return out(`A Meta recusou a operação ao ${STEP[step]}: ${e.message}`, target.field);
}

/** Linha pequena com etapa, código e trace id, para levar ao suporte da Meta. */
export function metaRef(x: Pick<MetaExplanation, "step" | "code" | "subcode" | "fbtraceId">): string {
  const parts = [`Etapa: ${x.step}`];
  if (x.code !== null) parts.push(`Código Meta: ${x.code}${x.subcode !== null ? `/${x.subcode}` : ""}`);
  if (x.fbtraceId) parts.push(`Trace ID: ${x.fbtraceId}`);
  return parts.join(" · ");
}

/** Segredos do app da Agência (podem ser vários, separados por vírgula). */
export function appSecrets(): string[] {
  return (process.env.META_APP_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** O que falta no servidor para o webhook único funcionar. Lista vazia = pronto. */
export function agencyAppMissing(): string[] {
  const miss: string[] = [];
  if (appSecrets().length === 0) miss.push("META_APP_SECRET");
  if ((process.env.META_VERIFY_TOKEN ?? "").length < 16) miss.push("META_VERIFY_TOKEN");
  return miss;
}
