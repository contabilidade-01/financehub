"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConciliacaoController = void 0;
const storage_1 = require("../storage");
const conciliacao_service_1 = require("../services/conciliacao.service");
// Garante que a empresa é do usuário logado (isolamento).
async function empresaDoUsuario(req, res) {
    var _a;
    const empresaId = Number(req.params.id);
    const emp = await storage_1.storage.getEmpresaById(empresaId);
    if (!emp || emp.usuario_id !== ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
        res.status(404).json({ error: "Empresa não encontrada" });
        return null;
    }
    return emp;
}
// Garante que a conta bancária pertence à empresa do usuário.
async function contaDaEmpresa(contaId, empresaId, res) {
    const conta = await (0, storage_1.getContaBancariaById)(contaId);
    if (!conta || conta.empresa_id !== empresaId) {
        res.status(404).json({ error: "Conta bancária não encontrada" });
        return null;
    }
    return conta;
}
class ConciliacaoController {
    // ---- Contas bancárias ----
    static async listarContas(req, res) {
        var _a;
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const de = req.query.de || undefined;
        const ate = req.query.ate || undefined;
        const existentes = await (0, storage_1.getContasBancariasByEmpresa)(emp.id);
        // Só cria Caixinha se a empresa ainda não tem nenhuma conta (sem write em GET rotineiro).
        if (!(existentes === null || existentes === void 0 ? void 0 : existentes.length)) {
            const { garantirCaixinhaPj } = await Promise.resolve().then(() => __importStar(require("../services/meio-pagamento-pj")));
            await garantirCaixinhaPj(emp.id, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id);
        }
        const { listarContasComSaldoPj } = await Promise.resolve().then(() => __importStar(require("../services/conta-bancaria.service")));
        res.json(await listarContasComSaldoPj(emp.id, de, ate));
    }
    static async lancamentosConta(req, res) {
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const conta = await contaDaEmpresa(Number(req.params.contaId), emp.id, res);
        if (!conta)
            return;
        const de = req.query.de || undefined;
        const ate = req.query.ate || undefined;
        const { montarExtratoContaPj } = await Promise.resolve().then(() => __importStar(require("../services/conta-bancaria.service")));
        const extrato = await montarExtratoContaPj(emp.id, conta.id, de, ate);
        res.json(Object.assign({ conta_id: conta.id, banco: conta.banco, nome: conta.nome || conta.banco, periodo: { de: de || null, ate: ate || null } }, extrato));
    }
    static async criarConta(req, res) {
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const b = req.body || {};
        if (!b.banco && !b.nome)
            return res.status(400).json({ error: "banco ou nome é obrigatório" });
        const nome = String(b.nome || b.banco).trim();
        const conta = await (0, storage_1.createContaBancaria)(Object.assign(Object.assign({}, b), { banco: b.banco || nome, nome, empresa_id: emp.id, usuario_id: req.user.id }));
        res.status(201).json(conta);
    }
    static async atualizarConta(req, res) {
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const conta = await contaDaEmpresa(Number(req.params.contaId), emp.id, res);
        if (!conta)
            return;
        res.json(await (0, storage_1.updateContaBancaria)(conta.id, req.body || {}));
    }
    static async removerConta(req, res) {
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const conta = await contaDaEmpresa(Number(req.params.contaId), emp.id, res);
        if (!conta)
            return;
        await (0, storage_1.deleteContaBancaria)(conta.id);
        res.json({ success: true });
    }
    // ---- Importação de extrato (OFX, CSV ou XLSX) ----
    static async importar(req, res) {
        var _a;
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const contaBancariaId = Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.conta_bancaria_id);
        const conta = await contaDaEmpresa(contaBancariaId, emp.id, res);
        if (!conta)
            return;
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: "Envie o arquivo (OFX, CSV ou XLSX) no campo 'arquivo'." });
        const nome = (file.originalname || "").toLowerCase();
        // Detecta o formato pelo conteúdo/extensão. OFX é texto com <OFX>/<STMTTRN>.
        const amostra = file.buffer.slice(0, 512).toString("utf8");
        const ehOfx = nome.endsWith(".ofx") || /<ofx|<stmttrn/i.test(amostra);
        try {
            let resultado;
            if (ehOfx) {
                let conteudo = file.buffer.toString("utf8");
                if (/�/.test(conteudo))
                    conteudo = file.buffer.toString("latin1");
                resultado = await (0, conciliacao_service_1.processarImportacaoOfx)({
                    empresaId: emp.id, contaBancariaId, usuarioId: req.user.id,
                    arquivoNome: file.originalname, conteudo,
                });
            }
            else {
                const formato = nome.endsWith(".csv") ? "csv" : "xlsx";
                resultado = await (0, conciliacao_service_1.processarImportacaoPlanilha)({
                    empresaId: emp.id, contaBancariaId, usuarioId: req.user.id,
                    arquivoNome: file.originalname, buffer: file.buffer, formato,
                });
            }
            res.json(resultado);
        }
        catch (e) {
            console.error("[Conciliação] erro ao importar:", e === null || e === void 0 ? void 0 : e.message);
            res.status(500).json({ error: "Falha ao processar o extrato", detalhe: e === null || e === void 0 ? void 0 : e.message });
        }
    }
    // ---- Movimentos ----
    static async listarMovimentos(req, res) {
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const importacaoId = req.query.importacao_id ? Number(req.query.importacao_id) : undefined;
        const contaBancariaId = req.query.conta_bancaria_id ? Number(req.query.conta_bancaria_id) : undefined;
        const status = req.query.status;
        const movs = await (0, storage_1.getMovimentos)({ importacaoId, contaBancariaId, status });
        // isolamento: só movimentos da empresa
        res.json(movs.filter((m) => m.empresa_id === emp.id));
    }
    // Lança um movimento (cria transação PJ na conta contábil escolhida) + aprende.
    static async lancar(req, res) {
        var _a;
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const mov = await (0, storage_1.getMovimentoById)(Number(req.params.mid));
        if (!mov || mov.empresa_id !== emp.id)
            return res.status(404).json({ error: "Movimento não encontrado" });
        const contaContabilId = Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.conta_contabil_id);
        if (!contaContabilId)
            return res.status(400).json({ error: "Informe conta_contabil_id" });
        // Isolamento: a conta contábil precisa ser do plano de contas DESTA empresa.
        const contas = await storage_1.storage.getEmpresasContasByEmpresaId(emp.id);
        const contaAlvo = contas.find((c) => c.id === contaContabilId);
        if (!contaAlvo)
            return res.status(400).json({ error: "Conta contábil inválida para esta empresa" });
        const tx = await (0, storage_1.lancarMovimentoComoTransacao)(mov, contaContabilId);
        // Aprende: essa descrição -> essa conta (para as próximas importações)
        const nome = contaAlvo.nome;
        await (0, storage_1.aprenderMemoriaContaPJ)(req.user.id, mov.descricao || "", contaContabilId, nome);
        res.json({ success: true, transacao: tx });
    }
    // Concilia um movimento a uma transação existente.
    static async conciliar(req, res) {
        var _a;
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const mov = await (0, storage_1.getMovimentoById)(Number(req.params.mid));
        if (!mov || mov.empresa_id !== emp.id)
            return res.status(404).json({ error: "Movimento não encontrado" });
        const txId = Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.transacao_id) || mov.transacao_id;
        if (!txId)
            return res.status(400).json({ error: "Informe transacao_id" });
        // Isolamento: a transação precisa pertencer a ESTA empresa (evita IDOR cross-tenant).
        if (!(await (0, storage_1.transacaoPjPertenceAEmpresa)(txId, emp.id))) {
            return res.status(404).json({ error: "Transação não encontrada" });
        }
        await (0, storage_1.conciliarMovimentoComTransacao)(mov.id, txId);
        res.json({ success: true });
    }
    static async ignorar(req, res) {
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const mov = await (0, storage_1.getMovimentoById)(Number(req.params.mid));
        if (!mov || mov.empresa_id !== emp.id)
            return res.status(404).json({ error: "Movimento não encontrado" });
        await (0, storage_1.updateMovimento)(mov.id, { status: "ignorado" });
        res.json({ success: true });
    }
    // Em lote: aceita todas as sugestões pendentes de uma importação.
    static async aceitarSugestoes(req, res) {
        var _a, _b;
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const importacaoId = Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.importacao_id);
        if (!importacaoId)
            return res.status(400).json({ error: "Informe importacao_id" });
        const movs = await (0, storage_1.getMovimentos)({ importacaoId, status: "pendente" });
        let n = 0;
        for (const mov of movs) {
            if (mov.empresa_id !== emp.id || !mov.sugestao_conta_id)
                continue;
            await (0, storage_1.lancarMovimentoComoTransacao)(mov, mov.sugestao_conta_id);
            const contas = await storage_1.storage.getEmpresasContasByEmpresaId(emp.id);
            const nome = (_b = contas.find((c) => c.id === mov.sugestao_conta_id)) === null || _b === void 0 ? void 0 : _b.nome;
            await (0, storage_1.aprenderMemoriaContaPJ)(req.user.id, mov.descricao || "", mov.sugestao_conta_id, nome);
            n++;
        }
        res.json({ success: true, lancados: n });
    }
    // Bater saldo: saldo do sistema vs saldo informado no extrato.
    static async baterSaldo(req, res) {
        const emp = await empresaDoUsuario(req, res);
        if (!emp)
            return;
        const conta = await contaDaEmpresa(Number(req.query.conta_bancaria_id), emp.id, res);
        if (!conta)
            return;
        const saldoSistema = await (0, storage_1.getSaldoSistemaConta)(conta.id);
        const imports = await (0, storage_1.getMovimentos)({ contaBancariaId: conta.id });
        // último saldo informado (da importação mais recente)
        const ultimaImport = await (0, storage_1.getUltimoSaldoInformado)(conta.id);
        const saldoExtrato = ultimaImport != null ? Number(ultimaImport) : null;
        const diferenca = saldoExtrato != null ? Math.round((saldoSistema - saldoExtrato) * 100) / 100 : null;
        res.json({
            saldo_sistema: saldoSistema,
            saldo_extrato: saldoExtrato,
            diferenca,
            bate: diferenca != null ? Math.abs(diferenca) < 0.01 : null,
            pendentes: imports.filter((m) => m.status === "pendente").length,
        });
    }
}
exports.ConciliacaoController = ConciliacaoController;
