"use server";
import { revalidatePath } from "next/cache";
import { parseContactsCsv, validateContact, type ContactInput } from "@/lib/contacts";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface SaveState {
  error?: string;
  ok?: boolean;
}
export interface ImportResult {
  error?: string;
  imported?: number;
  skippedExisting?: number;
  failed?: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

function friendly(message: string): string {
  if (message.includes("contacts_email_uniq")) return "Já existe um contato com esse e-mail.";
  if (message.includes("row-level security")) return "Você não tem permissão para isso.";
  if (message.includes("violates check constraint")) return "Algum campo está fora do limite permitido.";
  return "Não foi possível salvar. Tente de novo.";
}

/** Acha (sem diferenciar maiúsculas) ou cria a empresa pelo nome. */
async function ensureCompany(supabase: Supabase, orgId: string, userId: string, name: string): Promise<string | null> {
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

function row(v: ContactInput, orgId: string, userId: string, companyId: string | null, ownerId: string | null) {
  return {
    org_id: orgId,
    name: v.name,
    email: v.email,
    phone: v.phone,
    job_title: v.jobTitle,
    company_id: companyId,
    owner_id: ownerId,
    source: v.source,
    notes: v.notes,
    created_by: userId,
  };
}

export async function saveContact(_: SaveState | undefined, fd: FormData): Promise<SaveState> {
  const session = await requireSession();
  const v = validateContact(Object.fromEntries(fd));
  if (!v.ok) return { error: v.error };
  const id = String(fd.get("id") ?? "");
  const ownerRaw = String(fd.get("ownerId") ?? "");
  const ownerId = ownerRaw || null;

  const supabase = await createClient();
  const companyId = v.value.company ? await ensureCompany(supabase, session.org.id, session.userId, v.value.company) : null;

  if (id) {
    const { error } = await supabase
      .from("contacts")
      .update({
        name: v.value.name,
        email: v.value.email,
        phone: v.value.phone,
        job_title: v.value.jobTitle,
        company_id: companyId,
        owner_id: ownerId,
        source: v.value.source,
        notes: v.value.notes,
      })
      .eq("id", id)
      .eq("org_id", session.org.id);
    if (error) return { error: friendly(error.message) };
  } else {
    const { error } = await supabase.from("contacts").insert(row(v.value, session.org.id, session.userId, companyId, ownerId ?? session.userId));
    if (error) return { error: friendly(error.message) };
  }
  revalidatePath("/contatos");
  return { ok: true };
}

export async function deleteContact(id: string): Promise<SaveState> {
  const session = await requireSession();
  if (session.org.role === "seller") return { error: "Apenas administradores e gerentes excluem contatos." };
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/contatos");
  return { ok: true };
}

/** Importa de um CSV. O servidor refaz a leitura: nunca confia no que o navegador pré-validou. */
export async function importContacts(csv: string): Promise<ImportResult> {
  const session = await requireSession();
  const parsed = parseContactsCsv(String(csv ?? ""));
  if (parsed.tooLarge) return { error: "Arquivo grande demais. O limite é de 2.000 contatos por importação." };
  if (parsed.valid.length === 0) return { error: parsed.errors[0]?.error ?? "Nenhum contato válido no arquivo." };

  const supabase = await createClient();
  const emails = parsed.valid.map((c) => c.email).filter((e): e is string => !!e);
  const existing = new Set<string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from("contacts").select("email").eq("org_id", session.org.id).in("email", emails.slice(i, i + 200));
    data?.forEach((r) => r.email && existing.add(r.email.toLowerCase()));
  }
  const fresh = parsed.valid.filter((c) => !c.email || !existing.has(c.email));

  const companyIds = new Map<string, string | null>();
  for (const name of new Set(fresh.map((c) => c.company).filter((n): n is string => !!n))) {
    companyIds.set(name.toLowerCase(), await ensureCompany(supabase, session.org.id, session.userId, name));
  }

  let imported = 0;
  let failed = 0;
  const rows = fresh.map((c) => row(c, session.org.id, session.userId, c.company ? (companyIds.get(c.company.toLowerCase()) ?? null) : null, session.userId));
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from("contacts").insert(chunk);
    if (!error) {
      imported += chunk.length;
      continue;
    }
    // Um lote falhou (ex.: e-mail duplicado criado em paralelo): tenta um a um para salvar o resto.
    for (const r of chunk) {
      const { error: e1 } = await supabase.from("contacts").insert(r);
      if (e1) failed++;
      else imported++;
    }
  }
  revalidatePath("/contatos");
  return { imported, skippedExisting: parsed.valid.length - fresh.length, failed: failed + parsed.errors.length };
}
