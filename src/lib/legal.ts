/**
 * Dados da empresa que opera o serviço, usados nas páginas legais.
 * Defina no ambiente (Vercel → Settings → Environment Variables). Sem eles, as páginas usam texto genérico.
 */
export const LEGAL = {
  company: process.env.NEXT_PUBLIC_COMPANY_NAME || "a empresa responsável pelo Altum CRM",
  cnpj: process.env.NEXT_PUBLIC_COMPANY_CNPJ || "",
  contactEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  updatedAt: "16 de novembro de 2026",
};
