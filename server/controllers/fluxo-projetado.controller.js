"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFluxoProjetadoPessoal = getFluxoProjetadoPessoal;
exports.getFluxoProjetadoEmpresa = getFluxoProjetadoEmpresa;
const storage_1 = require("../storage");
const fluxo_projetado_service_1 = require("../services/fluxo-projetado.service");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Sem parâmetros, projeta do mês corrente até 11 meses à frente. */
function resolverJanela(req) {
    const de = typeof req.query.de === "string" && ISO.test(req.query.de) ? req.query.de : undefined;
    const ate = typeof req.query.ate === "string" && ISO.test(req.query.ate) ? req.query.ate : undefined;
    if ((de && !ate) || (!de && ate)) {
        return { erro: "Informe 'de' e 'ate' juntos, no formato AAAA-MM-DD." };
    }
    if (de && ate) {
        if (de > ate)
            return { erro: "'de' não pode ser maior que 'ate'." };
        return { de, ate };
    }
    const hoje = new Date();
    return {
        de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
        ate: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 12, 0)),
    };
}
// GET /api/fluxo-caixa/projetado?de=AAAA-MM-DD&ate=AAAA-MM-DD
async function getFluxoProjetadoPessoal(req, res) {
    try {
        if (!req.user)
            return res.status(401).json({ error: "Não autenticado" });
        const janela = resolverJanela(req);
        if ("erro" in janela)
            return res.status(400).json({ error: janela.erro });
        const wallet = await storage_1.storage.getWalletByUserId(req.user.id);
        if (!wallet)
            return res.status(404).json({ error: "Carteira não encontrada." });
        return res.json(await (0, fluxo_projetado_service_1.getFluxoProjetadoPF)(wallet.id, req.user.id, janela));
    }
    catch (err) {
        console.error("[FluxoProjetado] PF:", err);
        return res.status(500).json({ error: "Erro ao montar o fluxo projetado." });
    }
}
// GET /api/empresas/:id/relatorios/fluxo-projetado?de=AAAA-MM-DD&ate=AAAA-MM-DD
async function getFluxoProjetadoEmpresa(req, res) {
    try {
        if (!req.user)
            return res.status(401).json({ error: "Não autenticado" });
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await storage_1.storage.getEmpresaById(empresaId);
        if (!empresa)
            return res.status(404).json({ error: "Empresa não encontrada." });
        if (empresa.usuario_id !== req.user.id)
            return res.status(403).json({ error: "Acesso negado." });
        const janela = resolverJanela(req);
        if ("erro" in janela)
            return res.status(400).json({ error: janela.erro });
        return res.json(await (0, fluxo_projetado_service_1.getFluxoProjetadoPJ)(empresaId, janela));
    }
    catch (err) {
        console.error("[FluxoProjetado] PJ:", err);
        return res.status(500).json({ error: "Erro ao montar o fluxo projetado." });
    }
}
