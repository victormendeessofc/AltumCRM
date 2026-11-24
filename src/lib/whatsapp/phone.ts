/**
 * Só dígitos, com DDI. Números sem "+" nem "00" e com 10 ou 11 dígitos são tratados como brasileiros e ganham o 55;
 * com "+" ou "00" o DDI informado é respeitado. Retorna null se inválido.
 */
export function normalizePhone(input: string): string | null {
  const raw = String(input ?? "").trim();
  let d = raw.replace(/\D/g, "");
  const explicit = raw.startsWith("+") || d.startsWith("00");
  if (d.startsWith("00")) d = d.slice(2);
  if (!explicit && (d.length === 10 || d.length === 11)) d = "55" + d;
  return /^\d{8,15}$/.test(d) ? d : null;
}

/** 5511912345678 → +55 (11) 91234-5678. Fora do padrão brasileiro, devolve com o "+" na frente. */
export function formatPhone(digits: string): string {
  const d = String(digits ?? "").replace(/\D/g, "");
  const m = /^55(\d{2})(9?\d{4})(\d{4})$/.exec(d);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : d ? `+${d}` : "";
}

/** Número a partir do identificador do WhatsApp ("5511...@s.whatsapp.net"). Grupos e canais não viram conversa. */
export function phoneFromJid(jid: unknown): string | null {
  if (typeof jid !== "string") return null;
  const [user, server] = jid.split("@");
  if (!server || !["s.whatsapp.net", "c.us"].includes(server)) return null;
  return normalizePhone(user.split(":")[0]);
}

/**
 * Chave de telefone para achar a mesma pessoa (espelho de public.phone_key no banco). No Brasil: DDI + DDD + últimos
 * 8 dígitos, para o celular com e sem o 9 virar a mesma chave. Fora do Brasil, os dígitos com DDI.
 */
export function phoneKey(input: string | null | undefined): string | null {
  const d = normalizePhone(String(input ?? ""));
  if (!d) return null;
  return /^55\d{10,11}$/.test(d) ? `55${d.slice(2, 4)}${d.slice(-8)}` : d;
}
