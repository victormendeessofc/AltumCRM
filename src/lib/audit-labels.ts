const TABLES: Record<string, string> = {
  contacts: "Contato",
  deals: "Negócio",
  tasks: "Tarefa",
  memberships: "Acesso de usuário",
  invitations: "Convite",
  pipelines: "Funil",
  stages: "Etapa",
  organizations: "Organização",
};
const OPS: Record<string, string> = { INSERT: "criado", UPDATE: "alterado", DELETE: "excluído" };
const FIELDS: Record<string, string> = {
  name: "nome",
  title: "título",
  value: "valor",
  email: "e-mail",
  phone: "telefone",
  job_title: "cargo",
  company_id: "empresa",
  owner_id: "responsável",
  assignee_id: "responsável",
  stage_id: "etapa",
  contact_id: "contato",
  deal_id: "negócio",
  expected_close: "previsão",
  lost_reason: "motivo da perda",
  notes: "observações",
  source: "origem",
  due_at: "prazo",
  done_at: "conclusão",
  role: "papel",
  position: "ordem",
  probability: "probabilidade",
  monthly_goal: "meta mensal",
};

export function describeAudit(e: { table_name: string; op: string; changed: string[] | null }): string {
  const what = TABLES[e.table_name] ?? e.table_name;
  const op = OPS[e.op] ?? e.op.toLowerCase();
  const fields = (e.changed ?? []).map((f) => FIELDS[f] ?? f);
  return fields.length > 0 ? `${what} ${op} (${fields.join(", ")})` : `${what} ${op}`;
}
