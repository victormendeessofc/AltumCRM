import {
  LayoutGrid,
  Sparkles,
  ChartColumn,
  Kanban,
  Users,
  ListChecks,
  MessagesSquare,
  Smartphone,
  Inbox,
  Target,
  Settings,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

export interface NavEntry {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Rota ainda não construída: aparece desabilitada com selo "em breve" */
  soon?: boolean;
}
export interface NavGroup {
  group: string;
  items: NavEntry[];
}

/** Fase 1 entrega: painel, funis, contatos, tarefas, administração. O resto entra nas fases 2 e 3. */
export const NAV: NavGroup[] = [
  {
    group: "Visão geral",
    items: [
      { href: "/painel", icon: LayoutGrid, label: "Central" },
      { href: "/assistente", icon: Sparkles, label: "Assistente IA", soon: true },
      { href: "/analises", icon: ChartColumn, label: "Análises", soon: true },
    ],
  },
  {
    group: "Comercial",
    items: [
      { href: "/funis", icon: Kanban, label: "Funis de vendas" },
      { href: "/contatos", icon: Users, label: "Contatos" },
      { href: "/tarefas", icon: ListChecks, label: "Tarefas" },
    ],
  },
  {
    group: "Atendimento",
    items: [
      { href: "/conversas", icon: MessagesSquare, label: "Conversas", soon: true },
      { href: "/whatsapp", icon: Smartphone, label: "WhatsApp", soon: true },
      { href: "/suporte", icon: Inbox, label: "Suporte interno", soon: true },
    ],
  },
  { group: "Evolução", items: [{ href: "/performance", icon: Target, label: "Performance", soon: true }] },
  {
    group: "Gestão",
    items: [
      { href: "/admin", icon: Settings, label: "Administração" },
      { href: "/ajuda", icon: CircleHelp, label: "Ajuda" },
    ],
  },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
