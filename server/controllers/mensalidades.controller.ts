import { Request, Response } from "express";
import { storage } from "../storage";
import {
  listarMensalidades,
  criarMensalidade,
  atualizarMensalidade,
  excluirMensalidade,
  carteiraDoUsuario,
  gerarMensalidadeSeDevido,
  type MensalidadeInput,
  type TipoMeioMensalidade,
} from "../services/mensalidades.service";

/**
 * Mensalidades (recorrências mensais) — PF e PJ.
 * PF: sem empresa_id (usa a carteira do usuário).
 * PJ: empresa_id na query/body (valida posse).
 */

async function resolverEscopo(
  req: Request,
  empresaIdRaw: any,
): Promise<{ ok: true; empresaId: number | null; carteiraId: number | null } | { ok: false; status: number; error: string }> {
  const userId = req.user!.id;
  const empresaId = empresaIdRaw != null && empresaIdRaw !== "" ? Number(empresaIdRaw) : null;
  if (empresaId != null) {
    const empresa = await storage.getEmpresaById(empresaId);
    if (!empresa) return { ok: false, status: 404, error: "Empresa não encontrada." };
    if ((empresa as any).usuario_id !== userId) return { ok: false, status: 403, error: "Acesso negado." };
    return { ok: true, empresaId, carteiraId: null };
  }
  const carteiraId = await carteiraDoUsuario(userId);
  return { ok: true, empresaId: null, carteiraId };
}

export async function listar(req: Request, res: Response) {
  try {
    const esc = await resolverEscopo(req, req.query.empresa_id);
    if (!esc.ok) return res.status(esc.status).json({ error: esc.error });
    const lista = await listarMensalidades(req.user!.id, esc.empresaId);
    return res.json(lista);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar mensalidades" });
  }
}

function validarPayload(body: any, tipoMeio: TipoMeioMensalidade, empresaId: number | null): string | null {
  if (!String(body.descricao || "").trim()) return "Informe a descrição.";
  if (!(Number(body.valor) > 0)) return "Informe um valor válido.";
  const dia = Number(body.dia_vencimento);
  if (!(dia >= 1 && dia <= 31)) return "Dia de vencimento deve ser entre 1 e 31.";
  if (tipoMeio !== "boleto" && tipoMeio !== "cartao") return "Meio inválido (boleto ou cartao).";
  if (tipoMeio === "cartao") {
    if (empresaId == null && !body.forma_pagamento_id) return "Escolha o cartão (PF).";
    if (empresaId != null && !body.cartao_id) return "Escolha o cartão da empresa (PJ).";
  }
  return null;
}

export async function criar(req: Request, res: Response) {
  try {
    const body = req.body || {};
    const esc = await resolverEscopo(req, body.empresa_id);
    if (!esc.ok) return res.status(esc.status).json({ error: esc.error });
    if (esc.empresaId == null && !esc.carteiraId) {
      return res.status(400).json({ error: "Carteira do usuário não encontrada." });
    }
    const tipoMeio: TipoMeioMensalidade = body.tipo_meio === "cartao" ? "cartao" : "boleto";
    const erro = validarPayload(body, tipoMeio, esc.empresaId);
    if (erro) return res.status(400).json({ error: erro });

    const input: MensalidadeInput = {
      usuario_id: req.user!.id,
      empresa_id: esc.empresaId,
      carteira_id: esc.carteiraId,
      descricao: String(body.descricao).trim(),
      valor: Number(body.valor),
      dia_vencimento: Number(body.dia_vencimento),
      tipo_meio: tipoMeio,
      categoria_id: body.categoria_id != null && body.categoria_id !== "" ? Number(body.categoria_id) : null,
      conta_bancaria_id:
        tipoMeio === "boleto" && body.conta_bancaria_id ? Number(body.conta_bancaria_id) : null,
      forma_pagamento_id:
        tipoMeio === "cartao" && esc.empresaId == null && body.forma_pagamento_id
          ? Number(body.forma_pagamento_id)
          : null,
      cartao_id:
        tipoMeio === "cartao" && esc.empresaId != null && body.cartao_id ? Number(body.cartao_id) : null,
      data_fim: body.data_fim || null,
      origem: "app",
    };

    const criada = await criarMensalidade(input);
    // Gera já o mês atual (se ainda não gerado), para aparecer de imediato.
    let transacaoId: number | null = null;
    if (body.gerar_agora !== false) {
      transacaoId = await gerarMensalidadeSeDevido(criada.id);
    }
    return res.status(201).json({ ...criada, transacao_gerada_id: transacaoId });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao criar mensalidade" });
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const patch: any = {};
    for (const k of [
      "descricao",
      "valor",
      "dia_vencimento",
      "tipo_meio",
      "categoria_id",
      "conta_bancaria_id",
      "forma_pagamento_id",
      "cartao_id",
      "data_fim",
      "ativo",
    ]) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    const atualizada = await atualizarMensalidade(id, req.user!.id, patch);
    if (!atualizada) return res.status(404).json({ error: "Mensalidade não encontrada." });
    return res.json(atualizada);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao atualizar mensalidade" });
  }
}

export async function excluir(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const ok = await excluirMensalidade(id, req.user!.id);
    if (!ok) return res.status(404).json({ error: "Mensalidade não encontrada." });
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao excluir mensalidade" });
  }
}
