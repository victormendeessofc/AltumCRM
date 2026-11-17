/**
 * O administrador informa o endereço do servidor de QR Code; o app chama esse endereço a partir do servidor.
 * Para não virar porta de entrada para a rede interna, só aceita https e recusa nomes/IPs locais ou privados.
 */
export function publicHttpsUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return null;
  if (h.includes(":")) return null; // IPv6 literal
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  return u;
}

/** fetch com tempo limite e sem seguir redirecionamentos (evita desvio para endereços internos). */
export async function safeFetch(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  return fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
}
