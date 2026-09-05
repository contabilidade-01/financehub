/**
 * Oferta pendente: criar conta no plano PJ e mover o lançamento que caiu em Outras.
 * Persistência em memória (por processo) com TTL — suficiente para o turno
 * seguinte no WhatsApp após o agente perguntar "Quer que eu crie...?".
 */
import { storage } from "../storage";
import { atualizarTransacaoEmpresa } from "./empresa-transacao.service";
import { interpretarConfirmacao, type Confirmacao } from "./confirmacao-usuario";

export type OfertaCriarConta = {
  userId: number;
  empresaId: number;
  empresaNome: string;
  idTransacao: number;
  nomeConta: string;
  tipo: "Receita" | "Despesa";
  classificacao: "FIXA" | "VARIAVEL" | "OUTRA";
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const pendentes = new Map<number, OfertaCriarConta>();

export function registrarOfertaCriarConta(o: Omit<OfertaCriarConta, "expiresAt">): void {
  pendentes.set(o.userId, { ...o, expiresAt: Date.now() + TTL_MS });
}

export function obterOfertaCriarConta(userId: number): OfertaCriarConta | null {
  const o = pendentes.get(userId);
  if (!o) return null;
  if (Date.now() > o.expiresAt) {
    pendentes.delete(userId);
    return null;
  }
  return o;
}

export function limparOfertaCriarConta(userId: number): void {
  pendentes.delete(userId);
}

export async function criarContaEMoverLancamento(params: {
  userId: number;
  empresaId: number;
  idTransacao: number;
  nomeConta: string;
  tipo: "Receita" | "Despesa";
  classificacao?: "FIXA" | "VARIAVEL" | "OUTRA" | null;
}): Promise<
  | { ok: true; contaCriada: boolean; conta: { id: number; codigo: string; nome: string }; transacao: any }
  | { ok: false; error: string }
> {
  const nome = (params.nomeConta || "").trim();
  if (!nome) return { ok: false, error: "Nome da conta é obrigatório." };

  const tipo = params.tipo === "Receita" ? "Receita" : "Despesa";
  const classificacao =
    tipo === "Receita" ? "OUTRA" : (params.classificacao || "VARIAVEL");

  const contas = await storage.getEmpresasContasByEmpresaId(params.empresaId);
  const alvo = nome.toLowerCase();
  let conta = contas.find(
    (c) => c.tipo === tipo && c.nome.toLowerCase() === alvo,
  );
  let contaCriada = false;
  if (!conta) {
    // Match parcial só se único candidato do mesmo tipo.
    const parciais = contas.filter(
      (c) => c.tipo === tipo && c.nome.toLowerCase().includes(alvo),
    );
    if (parciais.length === 1) {
      conta = parciais[0];
    } else {
      conta = await storage.createEmpresaConta({
        empresa_id: params.empresaId,
        nome,
        tipo,
        classificacao,
      } as any);
      contaCriada = true;
    }
  }

  const r = await atualizarTransacaoEmpresa(
    params.empresaId,
    params.idTransacao,
    params.userId,
    { categoria_id: conta.id },
  );
  if (!r.ok) {
    return {
      ok: false,
      error: contaCriada
        ? `Conta ${conta.codigo} — ${conta.nome} criada, mas não consegui mover o lançamento: ${r.error}`
        : r.error,
    };
  }

  return {
    ok: true,
    contaCriada,
    conta: { id: conta.id, codigo: conta.codigo, nome: conta.nome },
    transacao: r.transacao,
  };
}

/** Se a mensagem for confirmação curta da oferta pendente, executa sem passar pelo LLM. */
export async function tentarResolverOfertaCriarConta(
  userId: number,
  userMessage: string,
): Promise<{ handled: true; reply: string } | { handled: false; confirmacao: Confirmacao; oferta: OfertaCriarConta | null }> {
  const oferta = obterOfertaCriarConta(userId);
  if (!oferta) return { handled: false, confirmacao: "ambiguo", oferta: null };

  const confirmacao = interpretarConfirmacao(userMessage);
  const curta = (userMessage || "").trim().length <= 60;

  if (confirmacao === "sim" && curta) {
    const r = await criarContaEMoverLancamento({
      userId,
      empresaId: oferta.empresaId,
      idTransacao: oferta.idTransacao,
      nomeConta: oferta.nomeConta,
      tipo: oferta.tipo,
      classificacao: oferta.classificacao,
    });
    limparOfertaCriarConta(userId);
    if (!r.ok) {
      return {
        handled: true,
        reply: `Não consegui concluir: ${r.error}. Pode tentar de novo pedindo para criar a conta *${oferta.nomeConta}*?`,
      };
    }
    const verbo = r.contaCriada ? "Criei" : "Já existia";
    return {
      handled: true,
      reply:
        `✅ ${verbo} a conta *${r.conta.codigo} — ${r.conta.nome}* e movi o lançamento 🔍 ${oferta.idTransacao} para lá.`,
    };
  }

  if (confirmacao === "nao" && curta) {
    limparOfertaCriarConta(userId);
    return {
      handled: true,
      reply:
        `👍 Beleza — mantive o lançamento 🔍 ${oferta.idTransacao} em *Outras*. Quando quiser criar a conta *${oferta.nomeConta}*, é só pedir.`,
    };
  }

  return { handled: false, confirmacao, oferta };
}
