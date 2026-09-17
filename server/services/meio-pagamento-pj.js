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
exports.ehCaixinha = ehCaixinha;
exports.contasBancariasReais = contasBancariasReais;
exports.garantirCaixinhaPj = garantirCaixinhaPj;
exports.contaPadraoPj = contaPadraoPj;
exports.casaNomeMeio = casaNomeMeio;
exports.aplicarMeioPagamentoPj = aplicarMeioPagamentoPj;
exports.resolverMeioPorNomePj = resolverMeioPorNomePj;
exports.classificarMatchesMeioPorNome = classificarMatchesMeioPorNome;
exports.classificarMatchesMeioPorNomeBasico = classificarMatchesMeioPorNomeBasico;
/**
 * Meio de pagamento PJ — visão de extrato.
 * Conta bancária → mexe no caixa.
 * Cartão de crédito → fatura / competência (não mexe no caixa).
 * Dinheiro / espécie → Caixinha (conta tipo caixa).
 * PIX / boleto / débito / TED NÃO são meio: perguntar a conta (Caixinha não conta).
 * Boleto NÃO é meio: o pagamento sai de uma conta.
 */
const fatura_pj_service_1 = require("./fatura-pj.service");
const storage_1 = require("../storage");
const parse_meio_1 = require("./parse-meio");
const NOME_CAIXINHA = "Caixinha";
function norm(s) {
    return (0, parse_meio_1.normMeio)(s);
}
function ehCaixinha(c) {
    const n = String((c === null || c === void 0 ? void 0 : c.nome) || "").trim().toLowerCase();
    const b = String((c === null || c === void 0 ? void 0 : c.banco) || "").trim().toLowerCase();
    return n === "caixinha" || b === "caixinha" || ((c === null || c === void 0 ? void 0 : c.tipo) === "caixa" && (n === "caixa" || b === "caixa"));
}
/** Contas bancárias de verdade (Pix/TED/boleto) — exclui Caixinha. */
function contasBancariasReais(ativas) {
    return (ativas || []).filter((c) => !ehCaixinha(c));
}
/** Garante a conta Caixinha da empresa (idempotente). */
async function garantirCaixinhaPj(empresaId, usuarioId) {
    const contas = await (0, storage_1.getContasBancariasByEmpresa)(empresaId);
    const existente = contas.find(ehCaixinha);
    if (existente) {
        if (String(existente.nome || "") !== NOME_CAIXINHA || existente.tipo !== "caixa") {
            try {
                await (0, storage_1.updateContaBancaria)(existente.id, {
                    banco: existente.banco || NOME_CAIXINHA,
                    nome: NOME_CAIXINHA,
                    tipo: "caixa",
                });
            }
            catch (_a) {
                // coluna nome pode falhar em update legado — segue com o id
            }
        }
        return Object.assign(Object.assign({}, existente), { nome: NOME_CAIXINHA, tipo: "caixa" });
    }
    return (0, storage_1.createContaBancaria)({
        empresa_id: empresaId,
        usuario_id: usuarioId !== null && usuarioId !== void 0 ? usuarioId : null,
        banco: NOME_CAIXINHA,
        nome: NOME_CAIXINHA,
        tipo: "caixa",
        saldo_inicial: 0,
    });
}
/** Preferência: Caixinha → corrente → caixa → primeira ativa. */
async function contaPadraoPj(empresaId) {
    var _a;
    const contas = await (0, storage_1.getContasBancariasByEmpresa)(empresaId);
    const ativas = contas.filter((c) => c.ativo !== false);
    const prefer = ativas.find(ehCaixinha) ||
        ativas.find((c) => c.tipo === "corrente") ||
        ativas.find((c) => c.tipo === "caixa") ||
        ativas[0];
    return (_a = prefer === null || prefer === void 0 ? void 0 : prefer.id) !== null && _a !== void 0 ? _a : null;
}
async function listasMeios(empresaId) {
    const contas = await (0, storage_1.getContasBancariasByEmpresa)(empresaId);
    const ativas = contas.filter((c) => c.ativo !== false);
    const bancarias = contasBancariasReais(ativas);
    const nomesContas = ativas.map((c) => c.nome || c.banco).filter(Boolean);
    const nomesBancarias = bancarias.map((c) => c.nome || c.banco).filter(Boolean);
    const cartoes = await (0, fatura_pj_service_1.listarCartoes)(empresaId);
    const nomesCartoes = cartoes.map((c) => c.nome);
    return { ativas, bancarias, nomesContas, nomesBancarias, cartoes, nomesCartoes };
}
/**
 * Casamento seguro de nome: todas as palavras do alvo precisam existir
 * no candidato (palavra inteira). Evita "via caixa" engolir "Caixa Econômica".
 * Ignora fillers (banco/cartão/cc) para "Inter" ≈ "Banco Inter" ≈ "Cartão Inter".
 */
const FILLER_MEIO = new Set(["banco", "cartao", "cc", "credito", "de", "do", "da", "conta"]);
function palavrasMeioSignificativas(s) {
    return norm(s)
        .split(/[^a-z0-9]+/)
        .filter((w) => w && !FILLER_MEIO.has(w));
}
function casaNomeMeio(alvoRaw, candidatoRaw) {
    const alvo = norm(alvoRaw);
    const cand = norm(candidatoRaw);
    if (!alvo || !cand)
        return false;
    if (alvo === cand)
        return true;
    const alvoWords = alvo.split(/[^a-z0-9]+/).filter(Boolean);
    const candWords = cand.split(/[^a-z0-9]+/).filter(Boolean);
    if (alvoWords.length === 0)
        return false;
    if (alvoWords.every((w) => candWords.includes(w)))
        return true;
    // Núcleo sem "banco"/"cartão": Inter ↔ Banco Inter ↔ Cartão Inter.
    const aCore = palavrasMeioSignificativas(alvo);
    const cCore = palavrasMeioSignificativas(cand);
    if (aCore.length > 0 && aCore.every((w) => cCore.includes(w)))
        return true;
    if (cCore.length > 0 && cCore.every((w) => aCore.includes(w)))
        return true;
    // Um único termo longo: prefixo/contém (ex.: "santand" → Santander).
    if (alvoWords.length === 1 && alvo.length > 5) {
        return candWords.some((w) => w.startsWith(alvo) || alvo.startsWith(w) || w.includes(alvo));
    }
    // Marca curta (inter, c6, bb, pan): palavra inteira no candidato.
    if (aCore.length === 1 && aCore[0].length >= 2 && aCore[0].length <= 5) {
        return cCore.includes(aCore[0]) || candWords.includes(aCore[0]);
    }
    return false;
}
function failCadastrarConta(termo, nomesCartoes) {
    return {
        ok: false,
        precisa: "cadastrar_conta",
        mensagem: `Você ainda não tem conta bancária cadastrada` +
            (termo ? ` (para ${termo})` : "") +
            `. Quer cadastrar agora? Me diga o banco e o nome (ex.: Itaú, Conta corrente). Use criar_conta_bancaria_empresa.`,
        sugestoes: [],
        contas: [],
        cartoes: nomesCartoes,
    };
}
function resolverContaNecessaria(termo, bancarias, nomesBancarias, nomesCartoes) {
    if (bancarias.length === 0) {
        return failCadastrarConta(termo, nomesCartoes);
    }
    if (bancarias.length === 1) {
        const c = bancarias[0];
        const rotulo = c.nome || c.banco;
        return {
            ok: true,
            conta_bancaria_id: c.id,
            rotulo,
            aviso: `Usei a conta ${rotulo} (única conta bancária cadastrada).`,
        };
    }
    return {
        ok: false,
        precisa: "conta",
        mensagem: `Em qual conta bancária foi o ${termo}? Você tem: ${nomesBancarias.join(", ")}.`,
        sugestoes: nomesBancarias,
        contas: nomesBancarias,
        cartoes: nomesCartoes,
    };
}
/**
 * Cartão → fatura + sem caixa.
 * Conta → caixa + conta (explícita ou Caixinha se exigirMeio sem id).
 */
async function aplicarMeioPagamentoPj(input) {
    const cartaoId = input.cartao_id != null ? Number(input.cartao_id) : null;
    const contaBody = input.conta_bancaria_id != null ? Number(input.conta_bancaria_id) : null;
    if (cartaoId) {
        if (input.tipo !== "Despesa") {
            throw new Error("Cartão de crédito só pode ser usado em Despesa.");
        }
        const cartao = await (0, fatura_pj_service_1.cartaoDoUsuario)(cartaoId, input.userId);
        if (!cartao || cartao.empresa_id !== input.empresaId) {
            throw new Error("Cartão não encontrado nesta empresa.");
        }
        const { fatura, competencia, metodo } = await (0, fatura_pj_service_1.resolverFaturaDoCartao)(input.empresaId, cartao, input.dataISO);
        return {
            cartao_id: cartao.id,
            conta_bancaria_id: null,
            fatura_id: fatura.id,
            competencia,
            movimenta_caixa: false,
            metodo_pagamento: metodo,
            empresa_forma_pagamento_id: null,
            isCartao: true,
        };
    }
    let contaId = null;
    if (contaBody) {
        const minhas = await (0, storage_1.getContasBancariasByEmpresa)(input.empresaId);
        if (!minhas.find((c) => c.id === contaBody)) {
            throw new Error("Conta bancária não encontrada nesta empresa.");
        }
        contaId = contaBody;
    }
    else if (input.exigirMeio) {
        await garantirCaixinhaPj(input.empresaId, input.userId);
        contaId = await contaPadraoPj(input.empresaId);
    }
    if (input.exigirMeio && !contaId) {
        throw new Error("Não foi possível usar a Caixinha. Cadastre uma conta em Contas Bancárias.");
    }
    const contas = await (0, storage_1.getContasBancariasByEmpresa)(input.empresaId);
    const conta = contas.find((c) => c.id === contaId);
    const metodo = conta ? (conta.nome || conta.banco || NOME_CAIXINHA) : NOME_CAIXINHA;
    return {
        cartao_id: null,
        conta_bancaria_id: contaId,
        fatura_id: null,
        competencia: null,
        movimenta_caixa: true,
        metodo_pagamento: metodo,
        empresa_forma_pagamento_id: null,
        isCartao: false,
    };
}
/**
 * Resolve texto do usuário/agente para cartão ou conta bancária.
 * Usa detectarMeio — "em dinheiro" / "via caixa" → Caixinha sem perguntar.
 * Com flag agente_meio_pagamento desligada: só match exato (modo básico).
 */
async function resolverMeioPorNomePj(empresaId, userId, texto) {
    const raw = (texto || "").trim();
    const { ativas, bancarias, nomesContas, nomesBancarias, cartoes, nomesCartoes } = await listasMeios(empresaId);
    let modoAvancado = true;
    try {
        const { flagAtiva, FLAG_AGENTE_MEIO_PAGAMENTO } = await Promise.resolve().then(() => __importStar(require("./feature-flags.service")));
        modoAvancado = await flagAtiva(FLAG_AGENTE_MEIO_PAGAMENTO, userId);
    }
    catch (_a) {
        modoAvancado = true; // se flags falharem, mantém comportamento atual (já no ar)
    }
    const det = (0, parse_meio_1.detectarMeio)(raw);
    if (det.tipo === "dinheiro") {
        const caixa = await garantirCaixinhaPj(empresaId, userId);
        return {
            ok: true,
            conta_bancaria_id: caixa.id,
            rotulo: NOME_CAIXINHA,
            aviso: "Lancei na Caixinha (dinheiro).",
        };
    }
    if (det.tipo === "conta_necessaria") {
        return resolverContaNecessaria(det.termo, bancarias, nomesBancarias, nomesCartoes);
    }
    // "conta bancária" / "no banco" (sem nome) — lista contas.
    if (det.tipo === "conta_generica" || /^(conta|banco)$/.test(norm(raw))) {
        return resolverContaNecessaria("conta", bancarias, nomesBancarias, nomesCartoes);
    }
    // "cartão" / "cartão de crédito" sem nome — nunca inventar Nubank/etc.
    if (det.tipo === "cartao_generico" || /^(cartao|cartao\s+de\s+credito|credito)$/.test(norm(raw))) {
        if (cartoes.length === 1) {
            return {
                ok: true,
                cartao_id: cartoes[0].id,
                rotulo: cartoes[0].nome,
                aviso: `Usei o cartão ${cartoes[0].nome} (único cadastrado).`,
            };
        }
        if (cartoes.length === 0) {
            return {
                ok: false,
                precisa: "cadastrar_cartao",
                mensagem: "Compra no cartão — qual o nome do cartão? Ainda não há nenhum cadastrado. Diga o nome + dia de fechamento e vencimento numa resposta só.",
                sugestoes: [],
                contas: nomesBancarias,
                cartoes: [],
                faltando: ["nome", "dia_fechamento", "dia_vencimento"],
                instrucao_agente: "Pergunte o nome do cartão e fechamento+vencimento. NÃO invente nome. Ao receber, cadastrar_cartao_empresa e lancar.",
            };
        }
        return {
            ok: false,
            precisa: "cartao",
            mensagem: `Em qual cartão? Você tem: ${nomesCartoes.join(", ")}.`,
            sugestoes: nomesCartoes,
            contas: nomesBancarias,
            cartoes: nomesCartoes,
            instrucao_agente: "Pergunte qual cartão da lista. NÃO invente nome que o usuário não disse.",
        };
    }
    if (!raw || det.tipo === "nenhum") {
        return {
            ok: false,
            precisa: "meio",
            mensagem: "Como foi pago/recebido? Conta bancária, Caixinha (dinheiro) ou cartão de crédito?",
            sugestoes: [...nomesContas, ...nomesCartoes.map((n) => `CC ${n}`)],
            contas: nomesContas,
            cartoes: nomesCartoes,
        };
    }
    // tipo === "nome" — tenta casar; se não achar, usa pista do texto (nunca marca = cartão).
    const termo = det.tipo === "nome" ? det.termo : raw;
    const alvo = norm(termo);
    const nn = norm(raw);
    const pista = det.tipo === "nome" && det.pista
        ? det.pista
        : (0, parse_meio_1.pistaContaNoTexto)(nn)
            ? "conta"
            : (0, parse_meio_1.pistaCartaoNoTexto)(nn)
                ? "cartao"
                : undefined;
    const acharCartoes = () => cartoes.filter((c) => {
        if (norm(c.nome) === alvo)
            return true;
        return modoAvancado ? casaNomeMeio(alvo, c.nome) : false;
    });
    const acharContas = () => ativas.filter((c) => {
        if (ehCaixinha(c))
            return false;
        if (norm(c.banco || "") === alvo || norm(c.nome || "") === alvo)
            return true;
        return modoAvancado
            ? casaNomeMeio(alvo, c.banco || "") || casaNomeMeio(alvo, c.nome || "")
            : false;
    });
    const acharCartao = () => acharCartoes()[0];
    const acharConta = () => acharContas()[0];
    // Com pista, procura só no lado certo primeiro.
    if (pista === "cartao") {
        const hits = acharCartoes();
        if (hits.length === 1) {
            return { ok: true, cartao_id: hits[0].id, rotulo: hits[0].nome };
        }
        if (hits.length > 1) {
            return failVariosCartoes(termo, hits, nomesBancarias, nomesCartoes);
        }
        // Conta homônima (ex.: tem conta Itaú, pediu cartão Itaú) → cadastrar CARTÃO, não devolver a conta.
        const contaHomo = acharConta();
        return failCadastrarCartao(termo, nomesBancarias, nomesCartoes, {
            temContaHomonia: !!contaHomo,
            rotuloConta: contaHomo ? String(contaHomo.nome || contaHomo.banco) : undefined,
        });
    }
    if (pista === "conta") {
        const hits = acharContas();
        if (hits.length === 1) {
            const c = hits[0];
            return { ok: true, conta_bancaria_id: c.id, rotulo: c.nome || c.banco };
        }
        if (hits.length > 1) {
            return failVariasContas(termo, hits, nomesBancarias, nomesCartoes);
        }
        return failCadastrarContaNome(termo, nomesBancarias, nomesCartoes);
    }
    // Sem pista: qualquer ambiguidade (marca em conta E cartão, ou vários no mesmo lado) → perguntar.
    // Modo básico (flag off): classificar só com match exato (sem fuzzy Inter≈Banco Inter).
    const classif = modoAvancado
        ? classificarMatchesMeioPorNome(termo, cartoes, ativas.filter((c) => !ehCaixinha(c)))
        : classificarMatchesMeioPorNomeBasico(termo, cartoes, ativas.filter((c) => !ehCaixinha(c)));
    if (classif.tipo === "cartao") {
        return { ok: true, cartao_id: classif.id, rotulo: classif.rotulo };
    }
    if (classif.tipo === "conta") {
        return { ok: true, conta_bancaria_id: classif.id, rotulo: classif.rotulo };
    }
    if (classif.tipo === "ambiguidade_conta_cartao") {
        return failAmbiguoContaOuCartao(termo, classif.contas, classif.cartoes, nomesBancarias, nomesCartoes);
    }
    if (classif.tipo === "varios_cartoes") {
        return failVariosCartoes(termo, classif.cartoes, nomesBancarias, nomesCartoes);
    }
    if (classif.tipo === "varias_contas") {
        return failVariasContas(termo, classif.contas, nomesBancarias, nomesCartoes);
    }
    return {
        ok: false,
        precisa: "meio",
        mensagem: `Não achei *${termo}* nesta empresa.` +
            (nomesBancarias.length ? ` Contas: ${nomesBancarias.join(", ")}.` : " Nenhuma conta bancária.") +
            (nomesCartoes.length ? ` Cartões: ${nomesCartoes.join(", ")}.` : " Nenhum cartão.") +
            ` *${termo}* é conta bancária ou cartão de crédito?`,
        sugestoes: [...nomesBancarias, ...nomesCartoes.map((n) => `CC ${n}`)],
        contas: nomesBancarias,
        cartoes: nomesCartoes,
        nome_sugerido: termo,
        instrucao_agente: "Pergunte se é conta ou cartão. Se conta → criar_conta_bancaria_empresa; se cartão → cadastrar_cartao_empresa (fechamento+vencimento). Mostre o que já existe.",
    };
}
function classificarMatchesMeioPorNome(termo, cartoes, contas) {
    const alvo = norm(termo);
    if (!alvo)
        return { tipo: "nenhum" };
    const cartoesHit = (cartoes || []).filter((c) => norm(c.nome) === alvo || casaNomeMeio(alvo, c.nome));
    const contasHit = (contas || []).filter((c) => norm(c.banco || "") === alvo ||
        norm(c.nome || "") === alvo ||
        casaNomeMeio(alvo, c.banco || "") ||
        casaNomeMeio(alvo, c.nome || ""));
    return classificarHits(cartoesHit, contasHit);
}
/** Modo básico (flag off): só igualdade normalizada — sem fuzzy. */
function classificarMatchesMeioPorNomeBasico(termo, cartoes, contas) {
    const alvo = norm(termo);
    if (!alvo)
        return { tipo: "nenhum" };
    const cartoesHit = (cartoes || []).filter((c) => norm(c.nome) === alvo);
    const contasHit = (contas || []).filter((c) => norm(c.banco || "") === alvo || norm(c.nome || "") === alvo);
    return classificarHits(cartoesHit, contasHit);
}
function classificarHits(cartoesHit, contasHit) {
    if (cartoesHit.length >= 1 && contasHit.length >= 1) {
        return { tipo: "ambiguidade_conta_cartao", contas: contasHit, cartoes: cartoesHit };
    }
    if (cartoesHit.length > 1) {
        return { tipo: "varios_cartoes", cartoes: cartoesHit };
    }
    if (contasHit.length > 1) {
        return { tipo: "varias_contas", contas: contasHit };
    }
    if (cartoesHit.length === 1) {
        return { tipo: "cartao", id: cartoesHit[0].id, rotulo: cartoesHit[0].nome };
    }
    if (contasHit.length === 1) {
        const c = contasHit[0];
        return { tipo: "conta", id: c.id, rotulo: String(c.nome || c.banco) };
    }
    return { tipo: "nenhum" };
}
function failAmbiguoContaOuCartao(termo, contasHit, cartoesHit, nomesBancarias, nomesCartoes) {
    const rotulosConta = contasHit.map((c) => String(c.nome || c.banco)).filter(Boolean);
    const rotulosCartao = cartoesHit.map((c) => c.nome);
    return {
        ok: false,
        precisa: "meio",
        mensagem: `*${termo}* existe como conta e como cartão nesta empresa.` +
            (rotulosConta.length ? ` Conta: ${rotulosConta.join(", ")}.` : "") +
            (rotulosCartao.length ? ` Cartão: ${rotulosCartao.join(", ")}.` : "") +
            ` É *conta bancária* ou *cartão de crédito*?`,
        sugestoes: [...rotulosConta, ...rotulosCartao.map((n) => `CC ${n}`)],
        contas: rotulosConta.length ? rotulosConta : nomesBancarias,
        cartoes: rotulosCartao.length ? rotulosCartao : nomesCartoes,
        nome_sugerido: termo,
        instrucao_agente: "Ambiguidade de marca (conta E cartão). Pergunte conta ou cartão — NÃO escolha sozinho. Na resposta, use forma_pagamento 'conta X' / 'banco X' ou 'cartão X' / 'CC X'.",
    };
}
function failVariosCartoes(termo, hits, nomesBancarias, nomesCartoes) {
    const nomes = hits.map((c) => c.nome);
    return {
        ok: false,
        precisa: "cartao",
        mensagem: `Achei mais de um cartão para *${termo}*: ${nomes.join(", ")}. Qual deles?`,
        sugestoes: nomes,
        contas: nomesBancarias,
        cartoes: nomes,
        nome_sugerido: termo,
        instrucao_agente: "Peça qual cartão da lista pelo nome exato. NÃO invente.",
    };
}
function failVariasContas(termo, hits, nomesBancarias, nomesCartoes) {
    const nomes = hits.map((c) => String(c.nome || c.banco)).filter(Boolean);
    return {
        ok: false,
        precisa: "conta",
        mensagem: `Achei mais de uma conta para *${termo}*: ${nomes.join(", ")}. Qual delas?`,
        sugestoes: nomes,
        contas: nomes,
        cartoes: nomesCartoes,
        nome_sugerido: termo,
        instrucao_agente: "Peça qual conta da lista pelo nome exato. NÃO invente.",
    };
}
function failCadastrarCartao(nome, nomesBancarias, nomesCartoes, opts) {
    // Se já existe cartão parecido na lista, NÃO peça cadastro — peça confirmação.
    const parecidos = nomesCartoes.filter((n) => casaNomeMeio(nome, n) || casaNomeMeio(n, nome));
    if (parecidos.length === 1) {
        return {
            ok: false,
            precisa: "cartao",
            mensagem: `Você já tem o cartão *${parecidos[0]}*. É esse? (Não cadastre de novo.)`,
            sugestoes: parecidos,
            contas: nomesBancarias,
            cartoes: nomesCartoes,
            nome_sugerido: parecidos[0],
            instrucao_agente: "O cartão JÁ EXISTE. Confirme o nome exato da lista e chame lancar/parcelar com forma_pagamento = esse nome. NÃO peça fechamento/vencimento nem cadastrar_cartao_empresa.",
        };
    }
    if (parecidos.length > 1) {
        return {
            ok: false,
            precisa: "cartao",
            mensagem: `Encontrei cartões parecidos com *${nome}*: ${parecidos.join(", ")}. Qual deles?`,
            sugestoes: parecidos,
            contas: nomesBancarias,
            cartoes: nomesCartoes,
            instrucao_agente: "Peça qual cartão da lista. NÃO cadastre outro com nome similar.",
        };
    }
    let mensagem = `Não achei o cartão *${nome}*.`;
    if (opts === null || opts === void 0 ? void 0 : opts.temContaHomonia) {
        mensagem =
            `*${opts.rotuloConta || nome}* está cadastrado como *conta bancária*, não como cartão.` +
                ` Parcelamento / fatura exige cartão de crédito.`;
    }
    if (nomesCartoes.length) {
        mensagem += ` Cartões que você já tem: ${nomesCartoes.join(", ")}.`;
    }
    else {
        mensagem += " Nenhum cartão cadastrado.";
    }
    if (nomesBancarias.length && !(opts === null || opts === void 0 ? void 0 : opts.temContaHomonia)) {
        mensagem += ` Contas bancárias: ${nomesBancarias.join(", ")}.`;
    }
    mensagem +=
        ` Para cadastrar o *cartão* *${nome}*, diga o dia de fechamento e o dia de vencimento numa resposta só.` +
            (nomesCartoes.length ? " Ou escolha um cartão da lista." : "");
    return {
        ok: false,
        precisa: "cadastrar_cartao",
        mensagem,
        sugestoes: nomesCartoes,
        contas: nomesBancarias,
        cartoes: nomesCartoes,
        nome_sugerido: nome,
        faltando: ["dia_fechamento", "dia_vencimento"],
        instrucao_agente: (opts === null || opts === void 0 ? void 0 : opts.temContaHomonia)
            ? "Há conta com esse nome, mas falta o CARTÃO. Peça fechamento+vencimento para cadastrar_cartao_empresa (não criar_conta). Se o usuário escolher um cartão da lista, use esse."
            : "Peça fechamento e vencimento numa pergunta só. cadastrar_cartao_empresa e em seguida o lançamento. Se a lista já tem cartão parecido, use o existente — não cadastre duplicata.",
    };
}
function failCadastrarContaNome(nome, nomesBancarias, nomesCartoes) {
    return {
        ok: false,
        precisa: "cadastrar_conta",
        mensagem: `Não achei *${nome}*.` +
            (nomesBancarias.length
                ? ` Suas contas: ${nomesBancarias.join(", ")}.`
                : " Nenhuma conta bancária cadastrada.") +
            (nomesCartoes.length ? ` Cartões: ${nomesCartoes.join(", ")}.` : "") +
            ` Quer cadastrar *${nome}* como conta bancária? Use criar_conta_bancaria_empresa.`,
        sugestoes: nomesBancarias,
        contas: nomesBancarias,
        cartoes: nomesCartoes,
        nome_sugerido: nome,
        instrucao_agente: "Ofereça cadastrar a conta com criar_conta_bancaria_empresa (confirme banco/nome). NÃO peça fechamento/vencimento de cartão.",
    };
}
