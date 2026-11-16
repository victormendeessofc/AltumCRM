import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermosPage() {
  return (
    <>
      <h1>Termos de Uso</h1>
      <p>Última atualização: {LEGAL.updatedAt}. Ao criar uma conta ou usar o Altum CRM você concorda com estes termos.</p>

      <h2>1. O serviço</h2>
      <p>
        O Altum CRM é um sistema online para equipes comerciais organizarem contatos, funis de vendas e tarefas, oferecido por <strong>{LEGAL.company}</strong>
        {LEGAL.cnpj ? ` (CNPJ ${LEGAL.cnpj})` : ""}.
      </p>

      <h2>2. Conta e organização</h2>
      <ul>
        <li>Você é responsável por manter sua senha em sigilo e pelas ações feitas na sua conta.</li>
        <li>Quem cria a organização é o administrador e responde pelos usuários que convidar e pelo que for cadastrado nela.</li>
        <li>Forneça informações verdadeiras e mantenha-as atualizadas.</li>
      </ul>

      <h2>3. Seus dados</h2>
      <p>Os dados que você cadastra continuam sendo seus. Você declara ter base legal para cadastrá-los (por exemplo, o consentimento ou outra hipótese da LGPD) e pode exportá-los em CSV a qualquer momento. O tratamento está descrito na <Link href="/privacidade">Política de Privacidade</Link>.</p>

      <h2>4. Uso aceitável</h2>
      <ul>
        <li>Não use o serviço para atividades ilegais, spam, assédio ou para armazenar dados que você não tem direito de tratar.</li>
        <li>Não tente acessar dados de outras organizações, burlar limites ou prejudicar a estabilidade do sistema.</li>
        <li>Podemos suspender contas que violem estes termos, com aviso sempre que possível.</li>
      </ul>

      <h2>5. Disponibilidade</h2>
      <p>Trabalhamos para manter o serviço disponível e seguro, mas não garantimos funcionamento ininterrupto. Manutenções e falhas de provedores podem causar indisponibilidades pontuais.</p>

      <h2>6. Cancelamento e exclusão</h2>
      <p>Você pode excluir a organização a qualquer momento em Administração → Organização. A exclusão apaga todos os dados dela de forma definitiva e não pode ser desfeita.</p>

      <h2>7. Limitação de responsabilidade</h2>
      <p>Na extensão permitida pela lei, não respondemos por lucros cessantes, perda de negócios ou danos indiretos decorrentes do uso do serviço. Recomendamos exportar seus dados periodicamente.</p>

      <h2>8. Alterações</h2>
      <p>Podemos alterar estes termos. Mudanças relevantes serão avisadas no sistema, e o uso continuado após o aviso indica concordância.</p>

      <h2>9. Foro</h2>
      <p>Estes termos seguem a lei brasileira. Fica eleito o foro do domicílio do consumidor, quando aplicável, ou o da sede da empresa responsável pelo serviço.</p>
    </>
  );
}
