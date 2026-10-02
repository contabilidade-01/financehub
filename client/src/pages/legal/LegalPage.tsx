import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { useSystemConfig } from "@/contexts/SystemConfigContext";

const ATUALIZADO_EM = "02/10/2026";

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Moldura({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { config } = useSystemConfig();
  useEffect(() => {
    document.title = `${titulo} — ${config?.system_name || "Khesef"}`;
  }, [titulo, config?.system_name]);

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <main className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-primary hover:underline">
          ← Voltar
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground">{titulo}</h1>
        <p className="mt-1 text-xs text-muted-foreground">Última atualização: {ATUALIZADO_EM}</p>
        {children}
        <nav className="mt-12 flex gap-4 border-t pt-6 text-xs text-muted-foreground" aria-label="Documentos legais">
          <Link href="/termos" className="hover:underline">Termos de Uso</Link>
          <Link href="/privacidade" className="hover:underline">Política de Privacidade</Link>
        </nav>
      </main>
    </div>
  );
}

export function Termos() {
  const { config } = useSystemConfig();
  const nome = config?.system_name || "Khesef";
  const email = config?.support_email || "suporte@controledinheiro.com.br";
  return (
    <Moldura titulo="Termos de Uso">
      <Secao titulo="1. O serviço">
        <p>
          O {nome} é um sistema de gestão financeira pessoal (PF) e empresarial (PJ) que permite registrar receitas e
          despesas, acompanhar contas, metas e relatórios, e lançar movimentações pelo painel ou pelo WhatsApp. Ao criar
          uma conta ou usar o serviço, você concorda com estes Termos.
        </p>
      </Secao>
      <Secao titulo="2. Cadastro e conta">
        <p>
          Você deve informar dados verdadeiros e manter a senha em sigilo. Cada conta é de uso individual (ou da empresa
          cadastrada) e você responde pelas atividades realizadas com ela.
        </p>
      </Secao>
      <Secao titulo="3. Período de teste, planos e pagamento">
        <p>
          Novas contas têm 15 dias de degustação gratuita. Depois, o uso continua mediante assinatura mensal, no valor
          exibido na página de planos. O pagamento é processado pelo Asaas, por Pix, boleto ou cartão. Se a mensalidade
          não for paga, o acesso pode ser limitado até a regularização.
        </p>
      </Secao>
      <Secao titulo="4. Cancelamento">
        <p>
          Você pode cancelar a assinatura a qualquer momento pelo próprio sistema ou pelo suporte. O cancelamento
          interrompe as próximas cobranças; o acesso segue até o fim do período já pago.
        </p>
      </Secao>
      <Secao titulo="5. Assistente com inteligência artificial">
        <p>
          O assistente interpreta mensagens, áudios, fotos e documentos para sugerir categorias e lançamentos. Ele pode
          errar: confira os lançamentos importantes. O {nome} é uma ferramenta de organização financeira e não substitui
          orientação contábil, jurídica ou de investimentos.
        </p>
      </Secao>
      <Secao titulo="6. Uso adequado">
        <p>
          É proibido usar o serviço para fins ilícitos, tentar acessar dados de outros usuários, burlar limites técnicos
          ou comprometer a segurança e a disponibilidade do sistema.
        </p>
      </Secao>
      <Secao titulo="7. Disponibilidade e responsabilidade">
        <p>
          Trabalhamos para manter o serviço disponível, mas ele pode ter interrupções para manutenção ou por falhas de
          terceiros (como WhatsApp e provedores de pagamento). Na extensão permitida em lei, não respondemos por danos
          indiretos decorrentes do uso ou da indisponibilidade do serviço.
        </p>
      </Secao>
      <Secao titulo="8. Dados pessoais">
        <p>
          O tratamento de dados pessoais segue a nossa{" "}
          <Link href="/privacidade" className="text-primary hover:underline">Política de Privacidade</Link>.
        </p>
      </Secao>
      <Secao titulo="9. Alterações e contato">
        <p>
          Podemos atualizar estes Termos; mudanças relevantes serão comunicadas no sistema ou por e-mail. Dúvidas:{" "}
          <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>. Fica eleito o foro do domicílio
          do consumidor, nos termos da legislação brasileira.
        </p>
      </Secao>
    </Moldura>
  );
}

export function Privacidade() {
  const { config } = useSystemConfig();
  const nome = config?.system_name || "Khesef";
  const email = config?.support_email || "suporte@controledinheiro.com.br";
  return (
    <Moldura titulo="Política de Privacidade">
      <Secao titulo="1. Quem somos">
        <p>
          O {nome} é o controlador dos dados pessoais tratados no serviço, conforme a Lei Geral de Proteção de Dados
          (LGPD, Lei 13.709/2018). Contato para assuntos de privacidade:{" "}
          <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>.
        </p>
      </Secao>
      <Secao titulo="2. Dados que tratamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Cadastro: nome, e-mail, telefone/WhatsApp, CPF ou CNPJ e senha (armazenada de forma protegida).</li>
          <li>Dados financeiros que você registra: lançamentos, categorias, carteiras, contas, metas e anexos.</li>
          <li>Mensagens, áudios, fotos e documentos enviados ao assistente pelo WhatsApp.</li>
          <li>Dados de assinatura e pagamento (status e identificadores; o cartão é tratado pelo Asaas).</li>
          <li>Dados técnicos: IP, navegador e registros de acesso, para segurança.</li>
        </ul>
      </Secao>
      <Secao titulo="3. Para que usamos">
        <p>
          Prestar o serviço, processar lançamentos e relatórios, cobrar a assinatura, dar suporte, prevenir fraudes e
          cumprir obrigações legais. Usamos apenas padrões gerais e agregados, nunca seus dados individuais, para
          melhorar o assistente.
        </p>
      </Secao>
      <Secao titulo="4. Com quem compartilhamos">
        <p>
          Apenas o necessário para operar o serviço: processador de pagamentos (Asaas), provedor de WhatsApp,
          provedores de inteligência artificial que interpretam suas mensagens, envio de e-mail e hospedagem. Não
          vendemos seus dados.
        </p>
      </Secao>
      <Secao titulo="5. Cookies">
        <p>
          Usamos um cookie de sessão, essencial para manter você conectado, e armazenamento local para preferências
          como o tema. Não usamos cookies de publicidade.
        </p>
      </Secao>
      <Secao titulo="6. Segurança e retenção">
        <p>
          Adotamos medidas técnicas como conexão criptografada (HTTPS), senhas protegidas e controle de acesso por
          conta. Mantemos os dados enquanto a conta estiver ativa e pelos prazos exigidos em lei; após o encerramento,
          eles são excluídos ou anonimizados.
        </p>
      </Secao>
      <Secao titulo="7. Seus direitos">
        <p>
          Você pode solicitar confirmação de tratamento, acesso, correção, portabilidade, anonimização, eliminação dos
          dados e revogação de consentimento (art. 18 da LGPD), escrevendo para{" "}
          <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>. Também pode reclamar à
          Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </Secao>
      <Secao titulo="8. Alterações">
        <p>Esta política pode ser atualizada; a data da última revisão aparece no topo da página.</p>
      </Secao>
    </Moldura>
  );
}
