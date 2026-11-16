import type { Metadata } from "next";
import { ContactsView, type ContactRow } from "@/components/contacts/contacts-view";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contatos" };

const PAGE_SIZE = 25;

/** Remove caracteres que têm significado na sintaxe de filtros do PostgREST. */
const cleanTerm = (s: string) => s.replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

export default async function ContatosPage({ searchParams }: PageProps<"/contatos">) {
  const session = await requireSession();
  const sp = await searchParams;
  const q = cleanTerm(typeof sp.q === "string" ? sp.q : "");
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select("id, name, email, phone, job_title, company_id, owner_id, source, notes", { count: "exact" })
    .eq("org_id", session.org.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);

  const [{ data: contacts, count }, { data: companies }, { data: ms }] = await Promise.all([
    query,
    supabase.from("companies").select("id, name").eq("org_id", session.org.id).order("name").limit(1000),
    supabase.from("memberships").select("user_id").eq("org_id", session.org.id),
  ]);
  const ids = (ms ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const owner = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));
  const company = new Map((companies ?? []).map((c) => [c.id, c.name]));

  const rows: ContactRow[] = (contacts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    jobTitle: c.job_title,
    company: c.company_id ? (company.get(c.company_id) ?? null) : null,
    ownerId: c.owner_id,
    ownerName: c.owner_id ? (owner.get(c.owner_id) ?? null) : null,
    source: c.source,
    notes: c.notes,
  }));

  return (
    <div className="animate-in-up">
      <ContactsView
        rows={rows}
        total={count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        q={q}
        meId={session.userId}
        members={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email }))}
        companies={(companies ?? []).map((c) => c.name)}
        canDelete={session.org.role !== "seller"}
        openNew={sp.novo === "1"}
      />
    </div>
  );
}
