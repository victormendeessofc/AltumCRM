import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

let client: SupabaseClient | undefined;

/**
 * Cliente Supabase do navegador. Usado só para o tempo real (assinar mudanças):
 * leituras e escritas continuam pelos Server Actions. Usa a sessão dos cookies, então
 * o Realtime aplica o RLS do usuário logado a cada evento.
 */
export function browserClient(): SupabaseClient {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
