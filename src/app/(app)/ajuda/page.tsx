import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Ajuda" };

const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

const Kbd = ({ children }: { children: ReactNode }) => <kbd className="rounded border border-line px-1.5 text-[12px]">{children}</kbd>;

const SECTIONS: { title: string; items: { q: string; a: ReactNode }[] }[] = [
  {
    title: "Primeiros passos",
    items: [
      {
        q: "Por onde começar?",
        a: (
          <>
            1) Cadastre ou <Link href="/contatos">importe seus contatos</Link>. 2) Crie negócios no <Link href="/funis">funil</Link>. 3) Agende o próximo passo em <Link href="/tarefas">Tarefas</Link>. 4) Defina a meta mensal em Administração → Organização para acompanhar o progresso na <Link href="/painel">Central</Link>.
          </>
        ),
      },
      { q: "Como convido minha equipe?", a: <>Em Administração → Usuários, informe o e-mail e o papel e clique em “Gerar convite”. Copie o link e envie pelo WhatsApp ou e-mail. Ele vale 7 dias e só funciona para o e-mail informado.</> },
      { q: "Quais são os papéis?", a: <>Administrador gerencia usuários, funis e configurações. Gerente acompanha o time e pode excluir contatos e negócios. Vendedor cria e edita contatos, negócios e tarefas.</> },
    ],
  },
  {
    title: "Contatos",
    items: [
      { q: "Como importo uma planilha?", a: <>Em Contatos, clique em Importar e escolha um arquivo CSV (no Excel: Salvar como → CSV). A primeira linha deve ter os títulos das colunas, com ao menos “Nome”. Também reconhecemos E-mail, Telefone, Empresa, Cargo, Origem e Observações. Mostramos uma prévia antes de importar, e contatos com e-mail já existente são pulados.</> },
      { q: "Posso baixar meus contatos?", a: <>Sim. Em Contatos, clique em Exportar. O arquivo CSV abre direto no Excel.</> },
    ],
  },
  {
    title: "Funis e negócios",
    items: [
      { q: "Como movo um negócio de etapa?", a: <>Arraste o cartão para a etapa desejada. No celular, segure o cartão por um instante e arraste. Você também pode abrir o negócio e escolher a etapa na lista. Pelo teclado: foque o cartão, aperte espaço e use as setas.</> },
      { q: "O que é “valor ponderado”?", a: <>É o valor do negócio multiplicado pela probabilidade da etapa em que ele está. Ajuda a estimar quanto você deve fechar de fato. As probabilidades são editáveis em Administração → Funis.</> },
      { q: "O que significa “parado”?", a: <>Negócio aberto que não muda de etapa há mais de 7 dias. Use o filtro “Parados” no funil para retomá-los.</> },
      { q: "Como marco um negócio como perdido?", a: <>Arraste até a coluna Perdido. Você pode informar o motivo, que fica no histórico do negócio.</> },
    ],
  },
  {
    title: "Atalhos",
    items: [
      { q: "Busca e comandos", a: <>Pressione <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> (ou <Kbd>⌘ K</Kbd> no Mac) para buscar contatos, negócios e tarefas, criar itens ou trocar o tema.</> },
    ],
  },
  {
    title: "Conta e privacidade",
    items: [
      { q: "Como troco minha senha ou o tema?", a: <>Em <Link href="/perfil">Meu perfil</Link>.</> },
      { q: "Como excluo todos os dados da empresa?", a: <>Administração → Organização → Zona de perigo. Exporte seus contatos antes: a exclusão é definitiva. Veja também a <Link href="/privacidade">Política de Privacidade</Link>.</> },
    ],
  },
];

export default function AjudaPage() {
  return (
    <div className="animate-in-up flex flex-col gap-4">
      <div>
        <h1 className="text-[28px] font-medium leading-tight">Ajuda</h1>
        <p className="text-[13px] text-fg-2">Respostas rápidas sobre o Altum CRM.</p>
      </div>
      {SECTIONS.map((s) => (
        <Card key={s.title} className="flex flex-col gap-2 p-4 md:p-6">
          <h2 className="px-2 pb-1 text-lg font-medium">{s.title}</h2>
          {s.items.map((it) => (
            <details key={it.q} className="group rounded-2xl px-2 py-1 open:bg-hover">
              <summary className="cursor-pointer list-none rounded-xl px-2 py-2 text-[15px] font-medium marker:content-none">{it.q}</summary>
              <div className="px-2 pb-3 text-[14px] leading-relaxed text-fg-2">{it.a}</div>
            </details>
          ))}
        </Card>
      ))}
      <Card className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Ainda com dúvida?</h2>
        <p className="text-[13px] text-fg-2">
          {SUPPORT ? (
            <>
              Escreva para <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>.
            </>
          ) : (
            "Fale com o administrador da sua organização."
          )}{" "}
          <Link href="/termos">Termos de uso</Link> · <Link href="/privacidade">Privacidade</Link>
        </p>
      </Card>
    </div>
  );
}
