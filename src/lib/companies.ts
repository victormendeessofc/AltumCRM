import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/** Acha (sem diferenciar maiúsculas) ou cria a empresa pelo nome. Retorna o id. */
export async function ensureCompany(supabase: Supabase, orgId: string, userId: string, name: string): Promise<string | null> {
  const find = async () => {
    const { data } = await supabase.from("companies").select("id").eq("org_id", orgId).ilike("name", escapeLike(name)).limit(1);
    return data?.[0]?.id ?? null;
  };
  const existing = await find();
  if (existing) return existing;
  const { data, error } = await supabase.from("companies").insert({ org_id: orgId, name, created_by: userId }).select("id").single();
  if (error) return await find(); // corrida: outra requisição criou antes
  return data.id;
}
