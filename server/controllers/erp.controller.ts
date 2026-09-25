import { Request, Response } from "express";
import * as erp from "../services/erp/erp.service";

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

export async function listarReceber(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    res.json(await erp.listarReceber(e.id, {
      status: String(req.query.status || "aberto"),
      de: req.query.de as string | undefined,
      ate: req.query.ate as string | undefined,
      contato_id: num(req.query.contato_id),
    }));
  } catch (err) { falha(res, err); }
}
export async function criarReceber(req: Request, res: Response) {
  try { const e = await empresa(req); res.status(201).json(await erp.criarReceber(e.id, req.body || {})); } catch (err) { falha(res, err); }
}
export async function receber(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    res.json(await erp.receber(e.id, (req.user as any).id, Number(req.params.tid), req.body || {}));
  } catch (err) { falha(res, err); }
}

export async function dre(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    const d = await erp.dreGerencial(e.id, {
      de: req.query.de as string | undefined,
      ate: req.query.ate as string | undefined,
      regime: String(req.query.regime || "caixa"),
      centro_custo_id: num(req.query.centro_custo_id),
    });
    if (req.query.formato === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="dre-${d.periodo.de}-a-${d.periodo.ate}-${d.regime}.csv"`);
      return res.send(erp.dreParaCsv(d));
    }
    res.json(d);
  } catch (err) { falha(res, err); }
}

export async function criarContaPlano(req: Request, res: Response) {
  try { const e = await empresa(req); res.status(201).json(await erp.criarContaPlano(e.id, req.body || {})); } catch (err) { falha(res, err); }
}
