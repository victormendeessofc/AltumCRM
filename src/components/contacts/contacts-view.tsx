"use client";
import { ChevronLeft, ChevronRight, Download, Plus, Search, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { deleteContact, importContacts, saveContact, type SaveState } from "@/lib/contact-actions";
import { parseContactsCsv, type ImportPreview } from "@/lib/contacts";
import { useSubmit } from "@/lib/use-submit";

export interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  company: string | null;
  ownerId: string | null;
  ownerName: string | null;
  source: string | null;
  notes: string | null;
}
export interface MemberOpt {
  id: string;
  name: string;
}

const fieldCls =
  "h-11 w-full rounded-full border border-line bg-raised px-4 text-sm text-fg outline-none transition-[border-color,box-shadow] duration-[160ms] ease-out placeholder:text-fg-3 focus:border-accent focus:shadow-[var(--focus-ring)]";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={"flex flex-col gap-1.5 text-[13px] font-medium text-fg-2 " + (className ?? "")}>
      {label}
      {children}
    </label>
  );
}

// ------------------------------------------------------------------ formulário
function ContactForm({
  contact,
  members,
  companies,
  canDelete,
  meId,
  onDone,
}: {
  contact: ContactRow | null;
  meId: string;
  members: MemberOpt[];
  companies: string[];
  canDelete: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useSubmit(async (prev: SaveState | undefined, fd: FormData) => {
    const r = await saveContact(prev, fd);
    if (r.ok) {
      toast.success(contact ? "Contato atualizado" : "Contato criado");
      onDone();
    }
    return r;
  });
  const [removing, startRemove] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <form onSubmit={action} className="flex flex-col gap-4">
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <Field label="Nome *">
        <input name="name" required autoFocus defaultValue={contact?.name ?? ""} className={fieldCls} maxLength={120} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail">
          <input name="email" type="email" defaultValue={contact?.email ?? ""} className={fieldCls} />
        </Field>
        <Field label="Telefone / WhatsApp">
          <input name="phone" type="tel" defaultValue={contact?.phone ?? ""} className={fieldCls} maxLength={40} />
        </Field>
        <Field label="Empresa">
          <input name="company" list="company-options" defaultValue={contact?.company ?? ""} className={fieldCls} maxLength={120} />
          <datalist id="company-options">
            {companies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Cargo">
          <input name="jobTitle" defaultValue={contact?.jobTitle ?? ""} className={fieldCls} maxLength={120} />
        </Field>
        <Field label="Responsável">
          <select name="ownerId" defaultValue={contact ? (contact.ownerId ?? "") : meId} className={fieldCls + " cursor-pointer"}>
            <option value="">Sem responsável</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Origem">
          <input name="source" placeholder="Indicação, site, Instagram…" defaultValue={contact?.source ?? ""} className={fieldCls} maxLength={60} />
        </Field>
      </div>
      <Field label="Observações">
        <textarea
          name="notes"
          rows={3}
          maxLength={5000}
          defaultValue={contact?.notes ?? ""}
          className="rounded-3xl border border-line bg-raised px-4 py-3 text-sm font-normal text-fg outline-none transition-[border-color,box-shadow] duration-[160ms] ease-out focus:border-accent focus:shadow-[var(--focus-ring)]"
        />
      </Field>

      {state?.error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {contact && canDelete ? (
          confirmDelete ? (
            <span className="flex items-center gap-2 text-[13px] text-fg-2">
              Excluir mesmo?
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={removing}
                onClick={() =>
                  startRemove(async () => {
                    const r = await deleteContact(contact.id);
                    if (r.error) toast.error(r.error);
                    else {
                      toast.success("Contato excluído");
                      onDone();
                    }
                  })
                }
              >
                Sim, excluir
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Não
              </Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" iconLeft={Trash2} onClick={() => setConfirmDelete(true)}>
              Excluir
            </Button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ importação
function ImportPanel({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-fg-2">
        Envie um arquivo <b className="font-medium text-fg">.csv</b> (Excel: Salvar como → CSV). A primeira linha precisa ser o cabeçalho, com ao menos a coluna{" "}
        <b className="font-medium text-fg">Nome</b>. Reconhecemos também E-mail, Telefone, Empresa, Cargo, Origem e Observações. Contatos com e-mail que já existe são pulados.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="Arquivo CSV"
        className="text-[13px] text-fg-2 file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-line file:bg-raised file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-fg"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 1_000_000) {
            setPreview({ valid: [], errors: [], ignoredColumns: [], tooLarge: true });
            return;
          }
          const t = await f.text();
          setFileName(f.name);
          setText(t);
          setPreview(parseContactsCsv(t));
        }}
      />
      {preview && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-raised p-4 text-[13px]">
          {preview.tooLarge ? (
            <p className="text-danger">Arquivo grande demais. O limite é de 2.000 contatos (1 MB) por importação.</p>
          ) : (
            <>
              <p>
                <b className="num font-medium text-success">{preview.valid.length}</b> contatos prontos para importar
                {fileName && <span className="text-fg-3"> · {fileName}</span>}
              </p>
              {preview.ignoredColumns.length > 0 && <p className="text-fg-3">Colunas ignoradas: {preview.ignoredColumns.join(", ")}</p>}
              {preview.errors.length > 0 && (
                <div>
                  <p className="text-warning">{preview.errors.length} linhas com problema (não serão importadas):</p>
                  <ul className="mt-1 max-h-28 overflow-y-auto text-fg-3">
                    {preview.errors.slice(0, 20).map((er) => (
                      <li key={er.line}>
                        Linha {er.line}: {er.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          iconLeft={Upload}
          disabled={pending || !preview || preview.valid.length === 0}
          onClick={() =>
            start(async () => {
              const r = await importContacts(text);
              if (r.error) return void toast.error(r.error);
              toast.success(
                `${r.imported} importados` +
                  (r.skippedExisting ? ` · ${r.skippedExisting} já existiam` : "") +
                  (r.failed ? ` · ${r.failed} com problema` : ""),
              );
              onDone();
            })
          }
        >
          {pending ? "Importando…" : `Importar ${preview?.valid.length ?? 0} contatos`}
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tela
export function ContactsView({
  rows,
  total,
  page,
  pageSize,
  q,
  members,
  companies,
  canDelete,
  meId,
  openNew,
}: {
  rows: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  members: MemberOpt[];
  companies: string[];
  canDelete: boolean;
  meId: string;
  openNew?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ContactRow | "new" | null>(openNew ? "new" : null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `/contatos?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  const onSearch = (v: string) => {
    setQuery(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.replace(v.trim() ? `/contatos?q=${encodeURIComponent(v.trim())}` : "/contatos"), 300);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium leading-tight">Contatos</h1>
          <p className="num text-[13px] text-fg-2">
            {total} {total === 1 ? "contato" : "contatos"}
            {q && ` para “${q}”`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button iconLeft={Upload} onClick={() => setImporting(true)}>
            Importar
          </Button>
          <a href="/contatos/export" download className="no-underline">
            <Button iconLeft={Download} tabIndex={-1}>
              Exportar
            </Button>
          </a>
          <Button variant="primary" iconLeft={Plus} onClick={() => setEditing("new")}>
            Novo contato
          </Button>
        </div>
      </div>

      <Input iconLeft={Search} size="lg" placeholder="Buscar por nome, e-mail ou telefone…" value={query} onChange={(e) => onSearch(e.target.value)} className="max-w-xl" aria-label="Buscar contatos" />

      <Card className="p-2 md:p-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-lg font-medium">{q ? "Nenhum contato encontrado" : "Nenhum contato ainda"}</p>
            <p className="max-w-sm text-[13px] text-fg-2">
              {q ? "Tente outro nome, e-mail ou telefone." : "Cadastre o primeiro contato ou importe uma planilha para começar."}
            </p>
            {!q && (
              <div className="flex gap-2">
                <Button iconLeft={Upload} onClick={() => setImporting(true)}>
                  Importar planilha
                </Button>
                <Button variant="primary" iconLeft={Plus} onClick={() => setEditing("new")}>
                  Novo contato
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ul>
            {rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition-[background-color] duration-[120ms] ease-out hover:bg-hover"
                >
                  <Avatar name={c.name} size={40} shape="square" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-[13px] text-fg-3">{[c.jobTitle, c.company].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                  <span className="hidden min-w-0 basis-56 flex-col md:flex">
                    <span className="truncate text-[13px]">{c.email ?? "—"}</span>
                    <span className="truncate text-[13px] text-fg-3">{c.phone ?? "—"}</span>
                  </span>
                  <span className="hidden basis-36 truncate text-[13px] text-fg-2 lg:block">{c.ownerName ?? "Sem responsável"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {pages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-between text-[13px] text-fg-2">
          <span className="num">
            Página {page} de {pages}
          </span>
          <span className="flex gap-2">
            {page > 1 ? (
              <Link href={href(page - 1)} className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-raised px-4 text-fg no-underline">
                <ChevronLeft size={16} aria-hidden /> Anterior
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={href(page + 1)} className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-raised px-4 text-fg no-underline">
                Próxima <ChevronRight size={16} aria-hidden />
              </Link>
            ) : null}
          </span>
        </nav>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Novo contato" : "Editar contato"}
        className="w-[min(94vw,640px)]"
      >
        {editing !== null && (
          <ContactForm
            key={editing === "new" ? "new" : editing.id}
            contact={editing === "new" ? null : editing}
            members={members}
            companies={companies}
            canDelete={canDelete}
            meId={meId}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>

      <Dialog open={importing} onOpenChange={setImporting} title="Importar contatos" className="w-[min(94vw,600px)]">
        {importing && <ImportPanel onDone={() => setImporting(false)} />}
      </Dialog>
    </div>
  );
}
