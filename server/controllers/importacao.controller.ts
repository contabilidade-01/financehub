import { Request, Response } from "express";
import * as svc from "../services/importacao/importacao.service";

/** Resposta padrão de erro: ErroImportacao vira 4xx com a mensagem; o resto é 500 genérico. */
function falha(res: Response, err: any) {
  if (err instanceof svc.ErroImportacao) return res.status(err.status).json({ error: err.message });
  console.error("[Importação] erro:", err?.message || err);
  return res.status(500).json({ error: "Erro ao processar a importação." });
}

const uid = (req: Request) => (req.user as any).id as number;
const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new svc.ErroImportacao("ID inválido");
  return id;
};

export async function criar(req: Request, res: Response) {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "Envie o arquivo (OFX, CSV ou Excel) no campo 'arquivo'." });
    const escopo = req.body?.escopo === "pj" ? "pj" : "pf";
    const r = await svc.criarSessao({
      usuarioId: uid(req),
      escopo,
      empresaId: escopo === "pj" ? Number(req.body?.empresa_id) : null,
      arquivoNome: String(file.originalname || "extrato"),
      buffer: file.buffer,
    });
    res.status(201).json(r);
  } catch (e) { falha(res, e); }
}

export async function listar(req: Request, res: Response) {
  try {
    res.json(await svc.listarSessoes(uid(req), {
      status: String(req.query.status || "rascunho"),
      escopo: String(req.query.escopo || ""),
      empresaId: req.query.empresa_id ? Number(req.query.empresa_id) : null,
    }));
  } catch (e) { falha(res, e); }
}

export async function detalhar(req: Request, res: Response) {
  try { res.json(await svc.detalharSessao(idParam(req), uid(req))); } catch (e) { falha(res, e); }
}

export async function mapeamento(req: Request, res: Response) {
  try { res.json(await svc.definirMapeamento(idParam(req), uid(req), req.body?.mapeamento)); } catch (e) { falha(res, e); }
}

export async function conta(req: Request, res: Response) {
  try {
    res.json(await svc.definirConta(idParam(req), uid(req), {
      contaBancariaId: req.body?.conta_bancaria_id ? Number(req.body.conta_bancaria_id) : undefined,
      nova: req.body?.nova,
    }));
  } catch (e) { falha(res, e); }
}

export async function linhas(req: Request, res: Response) {
  try { res.json(await svc.atualizarLinhas(idParam(req), uid(req), req.body?.linhas)); } catch (e) { falha(res, e); }
}

export async function regra(req: Request, res: Response) {
  try { res.json(await svc.aplicarRegra(idParam(req), uid(req), req.body || {})); } catch (e) { falha(res, e); }
}

export async function sugerir(req: Request, res: Response) {
  try {
    const id = idParam(req);
    const r = await svc.sugerirClassificacao(id, uid(req));
    const ia = req.body?.ia ? await svc.iniciarSugestaoIa(id, uid(req)) : null;
    res.json({ ...r, ia });
  } catch (e) { falha(res, e); }
}

export async function categoria(req: Request, res: Response) {
  try { res.status(201).json(await svc.criarCategoriaInline(idParam(req), uid(req), req.body || {})); } catch (e) { falha(res, e); }
}

export async function confirmar(req: Request, res: Response) {
  try {
    res.json(await svc.confirmar(idParam(req), uid(req), { semCategoria: req.body?.sem_categoria === "outras" ? "outras" : "bloquear" }));
  } catch (e) { falha(res, e); }
}

export async function cancelar(req: Request, res: Response) {
  try { res.json(await svc.cancelar(idParam(req), uid(req))); } catch (e) { falha(res, e); }
}
