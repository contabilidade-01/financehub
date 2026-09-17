"use strict";
/**
 * Escolhe a conta do plano PJ para um lançamento (WhatsApp/IA).
 *
 * Regra central (aprendida na marra): a conta que o MODELO informa só é aceita
 * quando as palavras do USUÁRIO sustentam a escolha. Sem sustentação, vale o que
 * a descrição diz — e, na dúvida, "Outras" (honesto) em vez de um palpite que
 * suja o DRE. Foi o que fazia "Abastecimento de carro" virar CMV e "Despesa de
 * cartório" virar Impostos: o modelo chutava o código e o código ganhava de tudo.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolverContaPj = resolverContaPj;
function normalizar(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9.\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
const REGRAS_RECEITA = [
    // Cobrir as formas verbais é essencial: o usuário escreve "vendi", não "venda".
    { re: /\b(venda|vendas|vendi|vendeu|vendemos|vender|mercadoria vendid|faturamento|faturei|faturou)\b/, codigo: "1.01" },
    { re: /\b(servico|servicos|consultoria|honorario|prestei|atendimento)\b/, codigo: "1.02" },
    { re: /\b(rendimento|aplicacao|juros receb)\b/, codigo: "1.04" },
];
const REGRAS_DESPESA = [
    { re: /\b(compra|compras).{0,20}mercador|\bcmv\b|\bfornecedor\b|\bestoque\b/, codigo: "3.01" },
    { re: /\bmateria.?prima\b|\binsumo/, codigo: "3.02" },
    { re: /\bcomissao/, codigo: "3.03" },
    { re: /\bfrete\b|\blogistica\b/, codigo: "3.04" },
    { re: /\bmarketing\b|\banuncio|\btrafego\b/, codigo: "3.05" },
    { re: /\bjuros\b|\btarifa banc|\biof\b|\btaxa banc/, codigo: "3.06" },
    { re: /\bfolha\b|\bsalario|\bfuncionario/, codigo: "2.01" },
    { re: /\baluguel\b/, codigo: "2.02" },
    { re: /\benergia\b|\bluz\b|\bagua\b|\binternet\b/, codigo: "2.03" },
    { re: /\bcontabil|\bcontador\b/, codigo: "2.04" },
    { re: /\bimposto|\bdas\b|\bipva\b|\blicenciamento\b|\bdocumento do carro/, codigo: "2.05" },
    { re: /\bpro.?labore\b|\bretirada\b/, codigo: "2.06" },
];
// CMV distorce Margem Bruta/Markup, então exige prova explícita de mercadoria.
const SINAIS_CMV = /\b(mercadoria|mercadorias|estoque|fornecedor|revenda|cmv|materia.?prima|insumo)/;
// Gastos que o modelo costuma confundir com "compra de mercadoria" — nunca são CMV.
const NAO_E_CMV = /\b(abastec|combustivel|gasolina|etanol|diesel|pedagio|estacionamento|oficina|mecanic|pneu|revisao|manutencao|cartorio|despachante|multa|seguro|uber|taxi|almoco|refeicao)/;
function porCodigo(contas, tipo, codigo) {
    return contas.find((c) => c.tipo === tipo && c.codigo === codigo);
}
function outrasDoTipo(contas, tipo) {
    const doTipo = contas.filter((c) => c.tipo === tipo);
    return doTipo.find((c) => /outr/i.test(c.nome)) || doTipo[0];
}
const PALAVRAS_FRACAS = new Set([
    "outras", "outra", "outros", "despesas", "despesa", "receitas", "receita",
    "operacionais", "operacional", "conta", "contas", "custo", "custos",
    "demais", "diversos", "diversas", "para", "com", "sem",
]);
/** Só vale se a conta do plano tiver a chave no nome. */
const SINONIMOS = {
    combustivel: ["abastecimento", "abastec", "gasolina", "etanol", "diesel", "alcool"],
    veiculo: ["carro", "frota", "alinhamento", "balanceamento"],
    veiculos: ["carro", "frota", "alinhamento", "balanceamento"],
    carro: ["veiculo", "alinhamento", "balanceamento", "oficina"],
    oficina: ["alinhamento", "balanceamento", "mecanica"],
    manutencao: ["alinhamento", "balanceamento", "oficina", "conserto"],
};
function tokensFortes(nome) {
    return normalizar(nome)
        .replace(/\(.*?\)/g, " ")
        .split(" ")
        .filter((t) => t.length >= 4 && !PALAVRAS_FRACAS.has(t));
}
function ehContaCmv(c) {
    return c.is_cmv === true || /\bcmv\b|mercadoria/i.test(c.nome);
}
/** Quanto o texto do usuário "puxa" para esta conta (0 = nada a ver). */
function pesoDaConta(c, texto) {
    if (!texto)
        return 0;
    const nome = normalizar(c.nome).replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
    let peso = 0;
    if (nome.length >= 4 && texto.includes(nome))
        peso = Math.max(peso, nome.length + 10);
    for (const tok of tokensFortes(c.nome)) {
        if (texto.includes(tok))
            peso = Math.max(peso, tok.length);
        for (const sin of SINONIMOS[tok] || []) {
            if (texto.includes(sin))
                peso = Math.max(peso, sin.length);
        }
    }
    return peso;
}
/** Regra de palavra-chave associada ao código daquela conta, se houver. */
function regraDoCodigo(tipo, codigo) {
    var _a;
    const regras = tipo === "Receita" ? REGRAS_RECEITA : REGRAS_DESPESA;
    return (_a = regras.find((r) => r.codigo === codigo)) === null || _a === void 0 ? void 0 : _a.re;
}
/** Uma conta de CMV só passa com sinal explícito de mercadoria e sem anti-sinal. */
function cmvPermitido(conta, textoUsuario) {
    if (!ehContaCmv(conta))
        return true;
    if (NAO_E_CMV.test(textoUsuario))
        return false;
    return SINAIS_CMV.test(textoUsuario);
}
/**
 * A conta informada pelo modelo tem respaldo no que o usuário escreveu?
 * Aceita respaldo pela regra de palavra-chave do código ("conta de luz" → 2.03)
 * ou pelo próprio nome/sinônimos da conta ("paguei o aluguel" → Aluguel).
 */
function corroborada(conta, tipo, textoUsuario) {
    if (!textoUsuario)
        return false;
    const re = regraDoCodigo(tipo, conta.codigo);
    if (re && re.test(textoUsuario))
        return true;
    return pesoDaConta(conta, textoUsuario) > 0;
}
/**
 * Casa a descrição com contas que o cliente já criou no plano.
 * Sem conta parecida → undefined (quem chama cai em Outras).
 */
function casarComPlanoVivo(contas, tipo, texto) {
    if (!texto)
        return undefined;
    const candidatas = contas.filter((c) => c.tipo === tipo && !/outr/i.test(c.nome));
    let melhor;
    for (const c of candidatas) {
        if (!cmvPermitido(c, texto))
            continue;
        const peso = pesoDaConta(c, texto);
        if (peso > 0 && (!melhor || peso > melhor.peso))
            melhor = { conta: c, peso };
    }
    return melhor === null || melhor === void 0 ? void 0 : melhor.conta;
}
/** Candidata derivada SÓ das palavras do usuário (sem contaminar com o palpite do modelo). */
function candidataPelaDescricao(contas, tipo, texto) {
    if (!texto)
        return undefined;
    const regras = tipo === "Receita" ? REGRAS_RECEITA : REGRAS_DESPESA;
    for (const r of regras) {
        if (!r.re.test(texto))
            continue;
        const c = porCodigo(contas, tipo, r.codigo);
        if (c && cmvPermitido(c, texto))
            return c;
    }
    return casarComPlanoVivo(contas, tipo, texto);
}
/** Casa nome/código informado pelo modelo, sem aceitar "Outras" cedo demais. */
function casarNomeOuCodigo(contas, tipo, alvo) {
    const n = normalizar(alvo);
    if (!n)
        return undefined;
    const doTipo = contas.filter((c) => c.tipo === tipo);
    const exato = doTipo.find((c) => normalizar(c.codigo) === n || normalizar(c.nome) === n);
    if (exato)
        return exato;
    const parcial = doTipo.find((c) => {
        const nome = normalizar(c.nome).replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
        if (nome.length < 4)
            return false;
        return nome.includes(n) || (n.length >= 5 && n.includes(nome));
    });
    if (parcial && !/outr/i.test(parcial.nome))
        return parcial;
    if (parcial && /outr/i.test(parcial.nome) && n.includes("outr"))
        return parcial;
    return undefined;
}
function resolverContaPj(opts) {
    const { contas, tipo, contaInformada, descricao, segmento } = opts;
    // Só as palavras do usuário: o palpite do modelo não entra aqui, senão ele
    // "prova" a si mesmo (informar a conta 'Impostos' fazia a regra de imposto casar).
    const texto = normalizar(descricao || "");
    const informada = casarNomeOuCodigo(contas, tipo, contaInformada || "");
    const informadaEspecifica = informada && !/outr/i.test(informada.nome) ? informada : undefined;
    const pelaDescricao = candidataPelaDescricao(contas, tipo, texto);
    // 1) Palpite do modelo, mas só se a descrição do usuário sustentar.
    if (informadaEspecifica
        && corroborada(informadaEspecifica, tipo, texto)
        && cmvPermitido(informadaEspecifica, texto)) {
        return { conta: informadaEspecifica, usouOutras: false, motivo: "informada" };
    }
    // 2) O que as palavras do usuário dizem.
    if (pelaDescricao) {
        return {
            conta: pelaDescricao,
            usouOutras: false,
            motivo: informadaEspecifica ? "descricao_sobre_informada" : "descricao",
            ignorouInformada: !!informadaEspecifica,
        };
    }
    // 3) "Entrada" / "recebi" sem detalhe: comércio → vendas; serviços → serviços.
    if (tipo === "Receita" && /\b(entrada|recebi|recebimento|caiu na conta)\b/.test(texto)) {
        const seg = normalizar(segmento || "");
        const codigo = seg.includes("comercio") ? "1.01" : seg.includes("servico") ? "1.02" : null;
        if (codigo) {
            const c = porCodigo(contas, tipo, codigo);
            if (c)
                return { conta: c, usouOutras: false, motivo: "segmento" };
        }
    }
    // 4) Sem respaldo nenhum: Outras (honesto) — e quem chama avisa o usuário.
    const fallback = outrasDoTipo(contas, tipo);
    return {
        conta: fallback,
        usouOutras: true,
        motivo: "outras",
        ignorouInformada: !!informadaEspecifica,
    };
}
