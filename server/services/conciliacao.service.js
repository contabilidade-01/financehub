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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sugerirClassificacao = sugerirClassificacao;
exports.processarImportacaoOfx = processarImportacaoOfx;
exports.parseArquivoExtrato = parseArquivoExtrato;
exports.processarImportacaoPlanilha = processarImportacaoPlanilha;
/**
 * Serviço de conciliação bancária.
 *
 * Determinístico: casamento por data+valor, dedup por FITID/hash, bater-saldo.
 * IA (só sugere): classificação de descrição bancária -> conta do plano de contas,
 * na ordem memória pessoal PJ -> memória global PJ -> modelo.
 */
const crypto_1 = require("crypto");
const axios_1 = __importDefault(require("axios"));
const XLSX = __importStar(require("xlsx"));
const ofx_parser_1 = require("../utils/ofx-parser");
const ai_errors_1 = require("../utils/ai-errors");
const storage_1 = require("../storage");
// Sugere a conta contábil para uma descrição bancária. Só sugestão.
async function sugerirClassificacao(userId, descricao, planoContas) {
    // 1) memória pessoal PJ
    const pessoal = await (0, storage_1.resolveMemoriaContaPJ)(userId, descricao);
    if (pessoal === null || pessoal === void 0 ? void 0 : pessoal.conta_contabil_id) {
        return { conta_id: pessoal.conta_contabil_id, origem: "memoria_pessoal", confianca: 92 };
    }
    // 2) memória global PJ (consenso agregado)
    const global = await (0, storage_1.resolveMemoriaGlobal)("pj", descricao);
    if (global === null || global === void 0 ? void 0 : global.categoria_nome) {
        const c = planoContas.find((p) => p.nome.toLowerCase() === global.categoria_nome.toLowerCase());
        if (c)
            return { conta_id: c.id, origem: "memoria_global", confianca: 75 };
    }
    // 3) modelo (IA) — opcional e resiliente
    try {
        const ia = await classificarComIA(descricao, planoContas);
        if (ia)
            return { conta_id: ia, origem: "ia", confianca: 60 };
    }
    catch ( /* sem IA disponível — segue sem sugestão */_a) { /* sem IA disponível — segue sem sugestão */ }
    return { conta_id: null, origem: null, confianca: null };
}
async function classificarComIA(descricao, planoContas) {
    var _a, _b, _c, _d;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || planoContas.length === 0)
        return null;
    const lista = planoContas.map((c) => `${c.codigo} — ${c.nome}`).join("\n");
    const prompt = `Você é um contador. Classifique a descrição de um lançamento bancário em UMA conta do plano de contas abaixo. Responda SOMENTE com o código da conta (ex.: "3.1.1"), nada mais.\n\nPlano de contas:\n${lista}\n\nDescrição: "${descricao}"\nCódigo:`;
    const resp = await (0, ai_errors_1.withRetry)(() => axios_1.default.post("https://api.openai.com/v1/chat/completions", { model: process.env.AI_MODEL || "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0 }, { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 }), { provider: "openai-classificacao" });
    const texto = (((_d = (_c = (_b = (_a = resp.data) === null || _a === void 0 ? void 0 : _a.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) || "").trim();
    const codigo = (texto.match(/[\d.]+/) || [])[0];
    if (!codigo)
        return null;
    const conta = planoContas.find((c) => c.codigo === codigo)
        || planoContas.find((c) => c.codigo.startsWith(codigo));
    return conta ? conta.id : null;
}
const _norm = (s) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const _shortHash = (s) => (0, crypto_1.createHash)("sha1").update(s).digest("hex").slice(0, 32);
function _normalizarData(v) {
    if (v instanceof Date && !isNaN(v.getTime()))
        return v.toISOString().slice(0, 10);
    const s = String(v !== null && v !== void 0 ? v : "").trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m)
        return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/);
    if (m)
        return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{2})$/);
    if (m)
        return `20${m[3]}-${m[2]}-${m[1]}`;
    return null;
}
function _parseValor(v) {
    if (typeof v === "number")
        return isNaN(v) ? null : v;
    let s = String(v !== null && v !== void 0 ? v : "").trim();
    if (!s)
        return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) {
        neg = true;
        s = s.slice(1, -1);
    }
    if (/[dD]$/.test(s) && !/[cC]$/.test(s))
        neg = true;
    s = s.replace(/[^0-9.,-]/g, "");
    if (s.includes(".") && s.includes(","))
        s = s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(","))
        s = s.replace(",", ".");
    const n = parseFloat(s);
    if (isNaN(n))
        return null;
    return neg ? -Math.abs(n) : n;
}
function parsePlanilha(buffer) {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws)
        return [];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    const out = [];
    for (const row of rows) {
        if (!Array.isArray(row) || row.length < 2)
            continue;
        let data = null, dataIdx = -1;
        for (let i = 0; i < row.length; i++) {
            const d = _normalizarData(row[i]);
            if (d) {
                data = d;
                dataIdx = i;
                break;
            }
        }
        if (!data)
            continue; // cabeçalho ou linha inválida
        let valor = null;
        for (let i = row.length - 1; i >= 0; i--) {
            if (i === dataIdx)
                continue;
            const cell = row[i];
            const isNumLike = typeof cell === "number" || /\d/.test(String(cell));
            if (!isNumLike)
                continue;
            const v = _parseValor(cell);
            if (v != null) {
                valor = v;
                break;
            }
        }
        if (valor == null || valor === 0)
            continue;
        let descricao = "Lançamento", maior = 0;
        row.forEach((c, i) => { const s = String(c !== null && c !== void 0 ? c : ""); if (i !== dataIdx && !(c instanceof Date) && !/^-?[\d.,\s]+$/.test(s.trim()) && s.trim().length > maior) {
            maior = s.trim().length;
            descricao = s.trim();
        } });
        out.push({ fitid: _shortHash(`${data}|${valor.toFixed(2)}|${_norm(descricao)}`), data, valor, tipo: valor >= 0 ? "credito" : "debito", descricao: descricao.slice(0, 255), memo: null });
    }
    return out;
}
// Núcleo comum: dedup -> importação -> movimentos -> casa/sugere.
async function _processarMovimentos(base, movimentos, meta = {}) {
    var _a, _b, _c;
    const { empresaId, contaBancariaId, usuarioId, arquivoNome, formato, hash } = base;
    const importacao = await (0, storage_1.criarImportacao)({
        empresa_id: empresaId, conta_bancaria_id: contaBancariaId, arquivo_nome: arquivoNome,
        formato, periodo_de: (_a = meta.periodoDe) !== null && _a !== void 0 ? _a : null, periodo_ate: (_b = meta.periodoAte) !== null && _b !== void 0 ? _b : null,
        saldo_final_informado: meta.saldoFinal != null ? meta.saldoFinal.toFixed(2) : null,
        hash_arquivo: hash,
    });
    const planoContas = (await storage_1.storage.getEmpresasContasByEmpresaId(empresaId));
    let conciliados = 0, aClassificar = 0, duplicados = 0, erros = 0;
    for (const mov of movimentos) {
        // Resiliência: uma linha com erro não aborta a importação inteira nem
        // devolve 500 no meio; segue processando as demais e conta os erros.
        try {
            // Casamento determinístico
            const candidatos = await (0, storage_1.buscarCandidatosConciliacao)(empresaId, mov.valor, mov.data);
            let status = "pendente", transacaoId = null;
            let sug = { conta_id: null, origem: null, confianca: null };
            if (candidatos.length === 1) {
                status = "conciliado";
                transacaoId = candidatos[0].id;
            }
            else {
                // Sem casamento claro -> sugerir classificação (IA/memória)
                sug = await sugerirClassificacao(usuarioId, mov.descricao, planoContas);
            }
            const criado = await (0, storage_1.criarExtratoMovimento)({
                importacao_id: importacao.id, conta_bancaria_id: contaBancariaId, empresa_id: empresaId,
                fitid: mov.fitid, data: mov.data, valor: mov.valor, tipo: mov.tipo,
                descricao: mov.descricao, memo: mov.memo, status,
                transacao_id: transacaoId, sugestao_conta_id: sug.conta_id,
                sugestao_origem: sug.origem, sugestao_confianca: sug.confianca,
            });
            if (!criado) {
                duplicados++;
                continue;
            }
            if (status === "conciliado" && transacaoId) {
                await (0, storage_1.conciliarMovimentoComTransacao)(criado.id, transacaoId);
                conciliados++;
            }
            else {
                aClassificar++;
            }
        }
        catch (err) {
            erros++;
            console.error("[Conciliação] falha ao processar movimento:", err === null || err === void 0 ? void 0 : err.message);
        }
    }
    return {
        importacao_id: importacao.id,
        total: movimentos.length,
        conciliados, a_classificar: aClassificar, duplicados, erros,
        saldo_final_informado: (_c = meta.saldoFinal) !== null && _c !== void 0 ? _c : null,
    };
}
// Processa um extrato OFX.
async function processarImportacaoOfx(params) {
    const { empresaId, contaBancariaId, usuarioId, arquivoNome, conteudo } = params;
    const hash = (0, crypto_1.createHash)("sha256").update(conteudo).digest("hex");
    if (await (0, storage_1.hashExtratoJaImportado)(contaBancariaId, hash)) {
        return { jaImportado: true, mensagem: "Este extrato já foi importado nesta conta." };
    }
    const extrato = (0, ofx_parser_1.parseOfx)(conteudo);
    if (extrato.movimentos.length === 0)
        return { erro: "Nenhum movimento encontrado no arquivo OFX." };
    return _processarMovimentos({ empresaId, contaBancariaId, usuarioId, arquivoNome, formato: "ofx", hash }, extrato.movimentos, { periodoDe: extrato.periodoDe, periodoAte: extrato.periodoAte, saldoFinal: extrato.saldoFinal });
}
// Parser genérico (OFX/CSV/XLSX) → lista de movimentos. Usado também pela
// conciliação de fatura de cartão.
function parseArquivoExtrato(buffer, filename) {
    const nome = (filename || "").toLowerCase();
    const amostra = buffer.slice(0, 512).toString("utf8");
    const ehOfx = nome.endsWith(".ofx") || /<ofx|<stmttrn/i.test(amostra);
    if (ehOfx) {
        let conteudo = buffer.toString("utf8");
        if (/�/.test(conteudo))
            conteudo = buffer.toString("latin1");
        return (0, ofx_parser_1.parseOfx)(conteudo).movimentos;
    }
    return parsePlanilha(buffer);
}
// Processa um extrato de planilha (CSV ou XLSX).
async function processarImportacaoPlanilha(params) {
    const { empresaId, contaBancariaId, usuarioId, arquivoNome, buffer, formato } = params;
    const hash = (0, crypto_1.createHash)("sha256").update(buffer).digest("hex");
    if (await (0, storage_1.hashExtratoJaImportado)(contaBancariaId, hash)) {
        return { jaImportado: true, mensagem: "Esta planilha já foi importada nesta conta." };
    }
    let movimentos;
    try {
        movimentos = parsePlanilha(buffer);
    }
    catch (e) {
        return { erro: "Não foi possível ler a planilha. Verifique o formato (colunas de data, descrição e valor)." };
    }
    if (movimentos.length === 0)
        return { erro: "Nenhum lançamento reconhecido na planilha (precisa de colunas com data, descrição e valor)." };
    return _processarMovimentos({ empresaId, contaBancariaId, usuarioId, arquivoNome, formato, hash }, movimentos);
}
