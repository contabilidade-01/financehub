import { Request, Response } from "express";
import * as erp from "../services/erp/erp.service";
import * as titulos from "../services/erp/titulos.service";
import * as analise from "../services/erp/analise.service";
import * as projecao from "../services/erp/projecao.service";

/** Rotas do ERP (PJ ME). requireErpPj já garantiu a modalidade; aqui, a empresa do usuário. */
function falha(res: Response, err: any) {
  if (err instanceof erp.ErroErp) return res.status(err.status).json({ error: err.message });
  console.error("[ERP] erro:", err?.message || err);
  return res.status(500).json({ error: "Erro ao processar a solicitação." });
}

async function empresa(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new erp.ErroErp("Empresa inválida");
  return erp.empresaDoUsuario(id, (req.user as any).id);
}
const num = (v: unknown) => (v === undefined || v === "" ? null : Number(v));

export async function listarContatos(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    res.json(await erp.listarContatos(e.id, { tipo: String(req.query.tipo || ""), q: String(req.query.q || ""), inativos: req.query.inativos === "1" }));
  } catch (err) { falha(res, err); }
}
export async function criarContato(req: Request, res: Response) {
  try { const e = await empresa(req); res.status(201).json(await erp.criarContato(e.id, req.body || {})); } catch (err) { falha(res, err); }
}
export async function atualizarContato(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await erp.atualizarContato(e.id, Number(req.params.cid), req.body || {})); } catch (err) { falha(res, err); }
}
export async function removerContato(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await erp.removerContato(e.id, Number(req.params.cid))); } catch (err) { falha(res, err); }
}

export async function listarCentros(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await erp.listarCentros(e.id, req.query.inativos === "1")); } catch (err) { falha(res, err); }
}
export async function criarCentro(req: Request, res: Response) {
  try { const e = await empresa(req); res.status(201).json(await erp.salvarCentro(e.id, req.body || {})); } catch (err) { falha(res, err); }
}
export async function atualizarCentro(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await erp.salvarCentro(e.id, req.body || {}, Number(req.params.cid))); } catch (err) { falha(res, err); }
}
export async function removerCentro(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await erp.removerCentro(e.id, Number(req.params.cid))); } catch (err) { falha(res, err); }
}

function filtrosTitulos(q: Request["query"]): titulos.FiltrosTitulos {
  const n = (v: unknown) => (v === undefined || v === "" ? null : Number(v));
  const valor = (v: unknown) => (v === undefined || v === "" ? null : titulos.dinheiro(v));
  return {
    status: String(q.status || "aberto"),
    de: q.de as string | undefined,
    ate: q.ate as string | undefined,
    pago_de: q.pago_de as string | undefined,
    pago_ate: q.pago_ate as string | undefined,
    contato_id: n(q.contato_id),
    categoria_id: n(q.categoria_id),
    centro_custo_id: n(q.centro_custo_id),
    conta_bancaria_id: n(q.conta_bancaria_id),
    q: q.q as string | undefined,
    valor_min: valor(q.valor_min),
    valor_max: valor(q.valor_max),
  };
}

// Contas a receber (Receita) e a pagar (Despesa): mesma regra, lados opostos.
export const listarReceber = (req: Request, res: Response) => listarTitulos(req, res, "Receita");
export const listarPagar = (req: Request, res: Response) => listarTitulos(req, res, "Despesa");
export const criarReceber = (req: Request, res: Response) => criarTitulo(req, res, "Receita");
export const criarPagar = (req: Request, res: Response) => criarTitulo(req, res, "Despesa");

async function listarTitulos(req: Request, res: Response, tipo: titulos.TipoTitulo) {
  try { const e = await empresa(req); res.json(await titulos.listarTitulos(e.id, tipo, filtrosTitulos(req.query))); } catch (err) { falha(res, err); }
}
async function criarTitulo(req: Request, res: Response, tipo: titulos.TipoTitulo) {
  try { const e = await empresa(req); res.status(201).json(await titulos.criarTitulo(e.id, tipo, req.body || {})); } catch (err) { falha(res, err); }
}

/** Baixa individual (compatível com a rota antiga de recebimento). */
export async function receber(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    const b = req.body || {};
    res.json(await titulos.baixarTitulos(e.id, [{ id: Number(req.params.tid), valor_pago: b.valor_pago }], b));
  } catch (err) { falha(res, err); }
}

/** Baixa em lote: { itens: [{ id, valor_pago? }], data_pagamento, conta_bancaria_id }. */
export async function baixar(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    const b = req.body || {};
    res.json(await titulos.baixarTitulos(e.id, Array.isArray(b.itens) ? b.itens : [], b));
  } catch (err: any) {
    if (err?.falhas) return res.status(err.status || 400).json({ error: err.message, falhas: err.falhas });
    falha(res, err);
  }
}

export async function estornar(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await titulos.estornarTitulos(e.id, (req.body || {}).ids)); } catch (err) { falha(res, err); }
}

function filtrosAnalise(q: Request["query"]): analise.FiltrosAnalise {
  return {
    de: q.de as string | undefined,
    ate: q.ate as string | undefined,
    regime: String(q.regime || "caixa"),
    centro_custo_id: num(q.centro_custo_id),
    contato_id: num(q.contato_id),
    conta_bancaria_id: num(q.conta_bancaria_id),
  };
}

export async function dre(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    const d = await analise.dreGerencial(e.id, filtrosAnalise(req.query));
    if (req.query.formato === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="dre-${d.periodo.de}-a-${d.periodo.ate}-${d.regime}.csv"`);
      return res.send(analise.dreParaCsv(d));
    }
    res.json(d);
  } catch (err) { falha(res, err); }
}

export async function painel(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await analise.painelAnalise(e.id, filtrosAnalise(req.query))); } catch (err) { falha(res, err); }
}

export async function projecaoCaixa(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    res.json(await projecao.projecaoCaixa(e.id, {
      horizonte: Number(req.query.horizonte) || undefined,
      agrupar: req.query.agrupar as string | undefined,
      conta_bancaria_id: num(req.query.conta_bancaria_id),
      cenario: req.query.cenario as string | undefined,
      inadimplencia_pct: num(req.query.inadimplencia_pct),
    }));
  } catch (err) { falha(res, err); }
}

export async function razao(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await analise.razao(e.id, filtrosAnalise(req.query))); } catch (err) { falha(res, err); }
}

export async function razaoConta(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    const r = await analise.lancamentosDaConta(e.id, Number(req.params.cid), filtrosAnalise(req.query));
    if (req.query.formato === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="razao-${r.conta.codigo}-${r.periodo.de}-a-${r.periodo.ate}.csv"`);
      return res.send(analise.razaoParaCsv(r));
    }
    res.json(r);
  } catch (err) { falha(res, err); }
}

export async function criarContaPlano(req: Request, res: Response) {
  try { const e = await empresa(req); res.status(201).json(await erp.criarContaPlano(e.id, req.body || {})); } catch (err) { falha(res, err); }
}

export async function listarTransferencias(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    res.json(await erp.listarTransferencias(e.id, { de: req.query.de as string, ate: req.query.ate as string }));
  } catch (err) { falha(res, err); }
}
export async function criarTransferencia(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    const b = req.body || {};
    // chaves de extrato só são gravadas pela importação, nunca pelo formulário
    res.status(201).json(await erp.criarTransferencia(e.id, (req.user as any).id, { ...b, chave_origem: null, chave_destino: null }));
  } catch (err) { falha(res, err); }
}
export async function removerTransferencia(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await erp.removerTransferencia(e.id, Number(req.params.tid))); } catch (err) { falha(res, err); }
}
