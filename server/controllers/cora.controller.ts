import { Request, Response } from "express";
import * as erp from "../services/erp/erp.service";
import * as cora from "../services/cora/cora.service";
import { ErroCora } from "../services/cora/cora.client";
import { SegredoIndisponivel } from "../utils/cripto-segredos";
import { getPublicAppUrl } from "../services/mailer";

/** Recebimentos via Cora (PJ ME). requireErpPj + flag já passaram; aqui, a empresa do usuário. */
function falha(res: Response, err: any) {
  if (err instanceof erp.ErroErp || err instanceof ErroCora) return res.status(err.status).json({ error: err.message });
  if (err instanceof SegredoIndisponivel) return res.status(503).json({ error: err.message });
  console.error("[Cora] erro:", err?.message || err);
  return res.status(500).json({ error: "Erro ao processar a solicitação." });
}

async function empresa(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new erp.ErroErp("Empresa inválida");
  return erp.empresaDoUsuario(id, (req.user as any).id);
}

export async function obterConexao(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await cora.obterConexao(e.id)); } catch (err) { falha(res, err); }
}
export async function salvarConexao(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await cora.salvarConexao(e.id, req.body || {})); } catch (err) { falha(res, err); }
}
export async function removerConexao(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await cora.removerConexao(e.id)); } catch (err) { falha(res, err); }
}
export async function testarConexao(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await cora.testarConexao(e.id)); } catch (err) { falha(res, err); }
}
export async function ativarWebhook(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    const base = getPublicAppUrl() || `${req.protocol}://${req.get("host")}`;
    res.json(await cora.ativarWebhook(e.id, base));
  } catch (err) { falha(res, err); }
}

export async function listarCobrancas(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    const q = req.query;
    res.json(await cora.listarCobrancas(e.id, {
      status: q.status as string, de: q.de as string, ate: q.ate as string, q: q.q as string,
      contato_id: q.contato_id ? Number(q.contato_id) : null,
    }));
  } catch (err) { falha(res, err); }
}

/** { transacao_ids: [...] } emite para contas a receber existentes; senão cria a conta a receber e emite. */
export async function emitir(req: Request, res: Response) {
  try {
    const e = await empresa(req);
    const b = req.body || {};
    const r = Array.isArray(b.transacao_ids)
      ? await cora.emitirParaTitulos(e.id, b.transacao_ids, { desconto_pct: b.desconto_pct })
      : await cora.novaCobranca(e.id, b);
    res.status(201).json(r);
  } catch (err) { falha(res, err); }
}

export async function sincronizar(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await cora.sincronizarCobranca(e.id, Number(req.params.cid))); } catch (err) { falha(res, err); }
}
export async function cancelar(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await cora.cancelar(e.id, Number(req.params.cid))); } catch (err) { falha(res, err); }
}
export async function enviarEmail(req: Request, res: Response) {
  try { const e = await empresa(req); res.json(await cora.enviarPorEmail(e.id, Number(req.params.cid))); } catch (err) { falha(res, err); }
}

/** POST /api/webhooks/cora/:token — público; responde rápido e sem detalhes. */
export async function webhook(req: Request, res: Response) {
  try {
    const r = await cora.processarWebhook(String(req.params.token || ""), req.headers as any, req.body);
    return res.status(r.status).json({ ok: r.status === 200 });
  } catch (err: any) {
    console.error("[Cora] webhook falhou:", err?.message || err);
    // 500 faz o Cora reenviar; a sincronização periódica também cobre.
    return res.status(500).json({ ok: false });
  }
}
