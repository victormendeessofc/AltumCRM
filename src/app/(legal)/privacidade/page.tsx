import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacidadePage() {
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p>Última atualização: {LEGAL.updatedAt}. Esta política explica como o Altum CRM trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD).</p>

      <h2>1. Quem é quem</h2>
      <p>
        O serviço é operado por <strong>{LEGAL.company}</strong>
        {LEGAL.cnpj ? ` (CNPJ ${LEGAL.cnpj})` : ""}. Tratamos dois tipos de dados:
      </p>
      <ul>
        <li>
          <strong>Dados da sua conta</strong> (nome, e-mail, senha protegida por criptografia, papel na organização): aqui somos o <strong>controlador</strong>.
        </li>
        <li>
          <strong>Dados dos seus contatos e negócios</strong> que a sua empresa cadastra no CRM: a sua empresa é a <strong>controladora</strong> e nós somos <strong>operadores</strong>, tratando esses dados apenas para prestar o serviço, conforme as instruções dela.
        </li>
      </ul>

      <h2>2. Quais dados coletamos</h2>
      <ul>
        <li>Conta: nome, e-mail, senha (nunca guardada em texto), data de criação.</li>
        <li>Uso: registros de ações importantes (quem criou ou alterou um item). Guardamos apenas o nome dos campos alterados, não o conteúdo.</li>
        <li>Conteúdo da organização: contatos, empresas, negócios, tarefas, notas e valores cadastrados pelos usuários.</li>
        <li>Técnicos: cookies essenciais de sessão e dados mínimos de conexão para segurança.</li>
      </ul>

      <h2>3. Para que usamos (e a base legal)</h2>
      <ul>
        <li>Prestar o serviço contratado e manter a sua conta (execução de contrato).</li>
        <li>Proteger o sistema contra fraude e uso indevido (legítimo interesse).</li>
        <li>Cumprir obrigações legais, quando houver.</li>
      </ul>
      <p>Não vendemos dados pessoais e não os usamos para publicidade.</p>

      <h2>4. Com quem compartilhamos</h2>
      <p>Usamos provedores de infraestrutura (suboperadores) estritamente necessários: <strong>Supabase</strong> (banco de dados e autenticação, região São Paulo, Brasil) e <strong>Vercel</strong> (hospedagem da aplicação). Podemos divulgar dados por ordem judicial ou exigência legal.</p>

      <h2>5. Cookies</h2>
      <p>Usamos somente cookies essenciais para manter você conectado. Não usamos cookies de rastreamento ou publicidade.</p>

      <h2>6. Por quanto tempo guardamos</h2>
      <p>Enquanto a conta e a organização existirem. Ao excluir a organização (Administração → Organização), todos os dados dela são apagados em definitivo do banco de dados. Cópias de segurança do provedor são removidas conforme o ciclo de retenção dele.</p>

      <h2>7. Seus direitos</h2>
      <p>Você pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade, informação sobre compartilhamento e a eliminação dos seus dados, entre outros direitos do art. 18 da LGPD.</p>
      <ul>
        <li>Se você é <strong>usuário</strong>: edite seus dados em Meu perfil ou peça ao administrador da sua organização.</li>
        <li>
          Se você é <strong>titular de dados cadastrados por uma empresa</strong> (por exemplo, é cliente dela): procure primeiro essa empresa, que é a controladora. Nós ajudamos a atender o pedido.
        </li>
        <li>
          Pedidos a nós:{" "}
          {LEGAL.contactEmail ? (
            <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
          ) : (
            "pelo canal de contato indicado pela empresa que operou a sua conta"
          )}
          . Respondemos em até 15 dias.
        </li>
      </ul>

      <h2>8. Segurança</h2>
      <p>Isolamos os dados de cada organização no banco (políticas de acesso por linha), usamos conexão criptografada (HTTPS), senhas com hash, controle de acesso por papéis (administrador, gerente, vendedor) e registro de atividades. Nenhum sistema é totalmente imune; em caso de incidente com risco relevante, avisaremos os afetados e a ANPD nos termos da lei.</p>

      <h2>9. Mudanças</h2>
      <p>Podemos atualizar esta política. A data no topo mostra a versão vigente; mudanças relevantes serão avisadas no sistema.</p>
    </>
  );
}
