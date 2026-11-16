import { toCsv } from "@/lib/csv";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Baixa todos os contatos da organização ativa em CSV (Excel pt-BR: separador ";" e UTF-8 com BOM). */
export async function GET() {
  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: contacts }, { data: companies }, { data: members }] = await Promise.all([
    supabase
      .from("contacts")
      .select("name, email, phone, job_title, company_id, owner_id, source, notes, created_at")
      .eq("org_id", session.org.id)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase.from("companies").select("id, name").eq("org_id", session.org.id),
    supabase.from("memberships").select("user_id").eq("org_id", session.org.id),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const company = new Map((companies ?? []).map((c) => [c.id, c.name]));
  const owner = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const csv = toCsv([
    ["Nome", "E-mail", "Telefone", "Empresa", "Cargo", "Responsável", "Origem", "Observações", "Criado em"],
    ...(contacts ?? []).map((c) => [
      c.name,
      c.email,
      c.phone,
      c.company_id ? company.get(c.company_id) : "",
      c.job_title,
      c.owner_id ? owner.get(c.owner_id) : "",
      c.source,
      c.notes,
      new Date(c.created_at).toLocaleDateString("pt-BR"),
    ]),
  ]);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contatos-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
