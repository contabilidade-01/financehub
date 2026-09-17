"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registrarOfertaCriarConta = registrarOfertaCriarConta;
exports.obterOfertaCriarConta = obterOfertaCriarConta;
exports.limparOfertaCriarConta = limparOfertaCriarConta;
exports.criarContaEMoverLancamento = criarContaEMoverLancamento;
exports.tentarResolverOfertaCriarConta = tentarResolverOfertaCriarConta;
/**
 * Oferta pendente: criar conta no plano PJ e mover o lançamento que caiu em Outras.
 * Persistência em memória (por processo) com TTL — suficiente para o turno
 * seguinte no WhatsApp após o agente perguntar "Quer que eu crie...?".
 */
const storage_1 = require("../storage");
const empresa_transacao_service_1 = require("./empresa-transacao.service");
const confirmacao_usuario_1 = require("./confirmacao-usuario");
const TTL_MS = 30 * 60 * 1000;
const pendentes = new Map();
function registrarOfertaCriarConta(o) {
    pendentes.set(o.userId, Object.assign(Object.assign({}, o), { expiresAt: Date.now() + TTL_MS }));
}
function obterOfertaCriarConta(userId) {
    const o = pendentes.get(userId);
    if (!o)
        return null;
    if (Date.now() > o.expiresAt) {
        pendentes.delete(userId);
        return null;
    }
    return o;
}
function limparOfertaCriarConta(userId) {
    pendentes.delete(userId);
}
async function criarContaEMoverLancamento(params) {
    const nome = (params.nomeConta || "").trim();
    if (!nome)
        return { ok: false, error: "Nome da conta é obrigatório." };
    const tipo = params.tipo === "Receita" ? "Receita" : "Despesa";
    const classificacao = tipo === "Receita" ? "OUTRA" : (params.classificacao || "VARIAVEL");
    const contas = await storage_1.storage.getEmpresasContasByEmpresaId(params.empresaId);
    const alvo = nome.toLowerCase();
    let conta = contas.find((c) => c.tipo === tipo && c.nome.toLowerCase() === alvo);
    let contaCriada = false;
    if (!conta) {
        // Match parcial só se único candidato do mesmo tipo.
        const parciais = contas.filter((c) => c.tipo === tipo && c.nome.toLowerCase().includes(alvo));
        if (parciais.length === 1) {
            conta = parciais[0];
        }
        else {
            conta = await storage_1.storage.createEmpresaConta({
                empresa_id: params.empresaId,
                nome,
                tipo,
                classificacao,
            });
            contaCriada = true;
        }
    }
    const r = await (0, empresa_transacao_service_1.atualizarTransacaoEmpresa)(params.empresaId, params.idTransacao, params.userId, { categoria_id: conta.id });
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
async function tentarResolverOfertaCriarConta(userId, userMessage) {
    const oferta = obterOfertaCriarConta(userId);
    if (!oferta)
        return { handled: false, confirmacao: "ambiguo", oferta: null };
    const confirmacao = (0, confirmacao_usuario_1.interpretarConfirmacao)(userMessage);
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
            reply: `✅ ${verbo} a conta *${r.conta.codigo} — ${r.conta.nome}* e movi o lançamento 🔍 ${oferta.idTransacao} para lá.`,
        };
    }
    if (confirmacao === "nao" && curta) {
        limparOfertaCriarConta(userId);
        return {
            handled: true,
            reply: `👍 Beleza — mantive o lançamento 🔍 ${oferta.idTransacao} em *Outras*. Quando quiser criar a conta *${oferta.nomeConta}*, é só pedir.`,
        };
    }
    return { handled: false, confirmacao, oferta };
}
