import { Request, Response } from "express";
import * as fatura from "../services/fatura-pj.service";
import { parseArquivoExtrato } from "../services/conciliacao.service";

/**
 * Fatura de cartão PJ (competência × caixa).
 * Cartões da empresa, compras (competência) e pagamento (caixa).
 */

async function guardEmpresa(req: Request, res: Response): Promise<number | null> {
  const userId = req.user!.id;
  const empresaId = parseInt(req.params.id);
  if (isNaN(empresaId)) { res.status(400).json({ error: "ID inválido." }); return null; }
  if (!(await fatura.empresaDoUsuario(empresaId, userId))) { res.status(404).json({ error: "Empresa não encontrada." }); return null; }
  return empresaId;
}

// GET /api/empresas/:id/cartoes
export async function listarCartoes(req: Request, res: Response) {
  const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
  return res.json(await fatura.listarCartoes(empresaId));
}

// POST /api/empresas/:id/cartoes
export async function criarCartao(req: Request, res: Response) {
  const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
  const b = req.body || {};
  const nome = (b.nome || "").toString().trim();
  const diaFech = Number(b.dia_fechamento), diaVenc = Number(b.dia_vencimento);
  if (!nome) return res.status(400).json({ error: "nome é obrigatório" });
  if (!(diaFech >= 1 && diaFech <= 31)) return res.status(400).json({ error: "dia_fechamento deve ser 1-31" });
  if (!(diaVenc >= 1 && diaVenc <= 31)) return res.status(400).json({ error: "dia_vencimento deve ser 1-31" });
  const cartao = await fatura.criarCartao(empresaId, {
    nome, bandeira: b.bandeira ?? null,
    limite: b.limite != null ? Number(b.limite).toFixed(2) : null,
    dia_fechamento: diaFech, dia_vencimento: diaVenc,
  });
  return res.status(201).json(cartao);
}

// DELETE /api/empresas/:id/cartoes/:cartaoId
export async function excluirCartao(req: Request, res: Response) {
  const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
  const cartao = await fatura.cartaoDoUsuario(Number(req.params.cartaoId), req.user!.id);
  if (!cartao || cartao.empresa_id !== empresaId) return res.status(404).json({ error: "Cartão não encontrado" });
  await fatura.excluirCartao(cartao.id);
  return res.json({ success: true });
}

// POST /api/empresas/:id/cartoes/:cartaoId/compras  { categoria_id, descricao, valor, data_transacao }
export async function registrarCompra(req: Request, res: Response) {
  const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
  const cartao = await fatura.cartaoDoUsuario(Number(req.params.cartaoId), req.user!.id);
  if (!cartao || cartao.empresa_id !== empresaId) return res.status(404).json({ error: "Cartão não encontrado" });
  const b = req.body || {};
  if (!b.categoria_id) return res.status(400).json({ error: "categoria_id (conta contábil) é obrigatória" });
  if (!b.descricao) return res.status(400).json({ error: "descricao é obrigatória" });
  if (b.valor == null || isNaN(Number(b.valor))) return res.status(400).json({ error: "valor inválido" });
  const data_transacao = /^\d{4}-\d{2}-\d{2}/.test(b.data_transacao || "") ? b.data_transacao : new Date().toISOString().slice(0, 10);
  const r = await fatura.registrarCompra(empresaId, cartao, { categoria_id: b.categoria_id, descricao: b.descricao, valor: b.valor, data_transacao });
  return res.status(201).json(r);
}

// GET /api/empresas/:id/cartoes/:cartaoId/faturas
export async function listarFaturas(req: Request, res: Response) {
  const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
  const cartao = await fatura.cartaoDoUsuario(Number(req.params.cartaoId), req.user!.id);
  if (!cartao || cartao.empresa_id !== empresaId) return res.status(404).json({ error: "Cartão não encontrado" });
  return res.json({ cartao, faturas: await fatura.listarFaturas(cartao.id) });
}

// GET /api/empresas/:id/cartoes/:cartaoId/saldo
export async function saldoCartao(req: Request, res: Response) {
  const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
  const cartao = await fatura.cartaoDoUsuario(Number(req.params.cartaoId), req.user!.id);
  if (!cartao || cartao.empresa_id !== empresaId) return res.status(404).json({ error: "Cartão não encontrado" });
  try {
    return res.json(await fatura.getSaldoCartaoEmpresa(cartao.id));
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao calcular saldo" });
  }
}

// GET /api/empresas/:id/cartoes-com-saldo
export async function listarCartoesComSaldo(req: Request, res: Response) {
  const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
  const de = (req.query.de as string) || undefined;
  const ate = (req.query.ate as string) || undefined;
  return res.json(await fatura.listarCartoesComSaldo(empresaId, de, ate));
}

// GET /api/empresas/:id/cartoes/:cartaoId/lancamentos
export async function lancamentosCartao(req: Request, res: Response) {
  const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
  const cartao = await fatura.cartaoDoUsuario(Number(req.params.cartaoId), req.user!.id);
  if (!cartao || cartao.empresa_id !== empresaId) {
    return res.status(404).json({ error: "Cartão não encontrado" });
  }
  const de = (req.query.de as string) || undefined;
  const ate = (req.query.ate as string) || undefined;
  const lista = await fatura.listarLancamentosCartaoPj(empresaId, cartao.id, de, ate);
  const mov = await fatura.movimentoCartaoPeriodoPj(cartao.id, de, ate);
  return res.json({
    cartao_id: cartao.id,
    cartao_nome: cartao.nome,
    periodo: { de: de || null, ate: ate || null },
    saldo: mov.usado,
    usado: mov.usado,
    lancamentos: lista,
  });
}

// GET /api/empresas/:id/faturas/:faturaId
export async function detalheFatura(req: Request, res: Response) {
  const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
  const f = await fatura.getFaturaById(Number(req.params.faturaId));
  if (!f || f.empresa_id !== empresaId) return res.status(404).json({ error: "Fatura não encontrada" });
  return res.json(await fatura.detalheFatura(f.id));
}

// POST /api/empresas/:id/faturas/:faturaId/fechar
export async function fecharFatura(req: Request, res: Response) {
  const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
  const f = await fatura.getFaturaById(Number(req.params.faturaId));
  if (!f || f.empresa_id !== empresaId) return res.status(404).json({ error: "Fatura não encontrada" });
  if (f.status === "paga") return res.status(409).json({ error: "Fatura já paga" });
  return res.json(await fatura.fecharFatura(f.id));
}

// POST /api/empresas/:id/faturas/:faturaId/conciliar  (multipart: arquivo OFX/CSV/XLSX)
export async function conciliarFatura(req: Request, res: Response) {
  try {
    const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
    const f = await fatura.getFaturaById(Number(req.params.faturaId));
    if (!f || f.empresa_id !== empresaId) return res.status(404).json({ error: "Fatura não encontrada" });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "Envie o extrato do cartão (OFX, CSV ou XLSX) no campo 'arquivo'." });
    const movimentos = parseArquivoExtrato(file.buffer, file.originalname || "");
    if (!movimentos.length) return res.status(400).json({ error: "Nenhum lançamento reconhecido no arquivo." });
    const resultado = await fatura.conciliarFatura(f, movimentos.map((m: any) => ({ data: m.data, valor: m.valor, descricao: m.descricao })));
    return res.json(resultado);
  } catch (e: any) {
    console.error("conciliarFatura PJ:", e);
    return res.status(500).json({ error: e?.message || "Erro ao conciliar fatura" });
  }
}

// POST /api/empresas/:id/faturas/:faturaId/pagar  { conta_contabil_id, conta_bancaria_id?, data_pagamento? }
export async function pagarFatura(req: Request, res: Response) {
  try {
    const empresaId = await guardEmpresa(req, res); if (!empresaId) return;
    const f = await fatura.getFaturaById(Number(req.params.faturaId));
    if (!f || f.empresa_id !== empresaId) return res.status(404).json({ error: "Fatura não encontrada" });
    if (f.status === "paga") return res.status(409).json({ error: "Fatura já está paga" });
    const cartao = await fatura.cartaoDoUsuario(f.cartao_id, req.user!.id);
    if (!cartao) return res.status(404).json({ error: "Cartão não encontrado" });
    const b = req.body || {};
    if (!b.conta_contabil_id) return res.status(400).json({ error: "conta_contabil_id é obrigatória (classificação do pagamento)" });
    const r = await fatura.pagarFatura(empresaId, f, cartao, {
      conta_contabil_id: Number(b.conta_contabil_id),
      conta_bancaria_id: b.conta_bancaria_id ? Number(b.conta_bancaria_id) : null,
      data_pagamento: b.data_pagamento,
    });
    return res.json(r);
  } catch (e: any) {
    console.error("pagarFatura PJ:", e);
    return res.status(500).json({ error: e?.message || "Erro ao pagar fatura" });
  }
}
