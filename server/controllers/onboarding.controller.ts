import { Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";

/**
 * Checklist "Primeiros passos" — GET /api/onboarding/checklist
 *
 * Não existe uma tabela de "progresso" marcada manualmente: cada item é
 * derivado do estado REAL dos dados (existe pelo menos 1 transação via
 * WhatsApp? existe pelo menos 1 conta bancária?...), então está sempre
 * correto e nunca precisa ser "resetado".
 *
 * A lista de itens muda conforme tipo_pessoa (PF x PJ), com base nas
 * funcionalidades que de fato existem no schema/controllers.
 */

interface ChecklistItem {
  id: string;
  titulo: string;
  descricao: string;
  concluido: boolean;
  ctaLabel: string;
  ctaHref: string;
}

export async function getChecklist(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const isPJ = (req.user as any)?.tipo_pessoa === "juridica";

    const itens: ChecklistItem[] = isPJ
      ? await montarChecklistPJ(userId)
      : await montarChecklistPF(userId);

    const concluidos = itens.filter((i) => i.concluido).length;

    return res.json({
      itens,
      total: itens.length,
      concluidos,
      completo: concluidos === itens.length,
    });
  } catch (e: any) {
    console.error("[Onboarding] Erro ao montar checklist:", e);
    return res.status(500).json({ error: e?.message || "Erro ao montar checklist" });
  }
}

async function montarChecklistPF(userId: number): Promise<ChecklistItem[]> {
  const [
    lancamentoWhatsapp,
    contaBancaria,
    cartao,
    orcamento,
  ] = await Promise.all([
    existeLancamentoWhatsappPF(userId),
    db.execute(sql`SELECT 1 FROM contas_bancarias WHERE usuario_id = ${userId} AND empresa_id IS NULL LIMIT 1`),
    db.execute(sql`SELECT 1 FROM formas_pagamento WHERE usuario_id = ${userId} AND limite IS NOT NULL LIMIT 1`),
    db.execute(sql`SELECT 1 FROM metas_financeiras WHERE usuario_id = ${userId} AND empresa_id IS NULL AND tipo = 'limite_categoria' LIMIT 1`),
  ]);

  return [
    {
      id: "lancamento_whatsapp",
      titulo: "1º lançamento pelo WhatsApp",
      descricao: "Mande uma mensagem tipo \"gastei 50 no mercado\" pro WhatsApp do Khesef.",
      concluido: lancamentoWhatsapp,
      ctaLabel: "Ver transações",
      ctaHref: "/transactions",
    },
    {
      id: "conta_bancaria",
      titulo: "1ª conta bancária cadastrada",
      descricao: "Opcional — ajuda a acompanhar o saldo real, mas não é obrigatório para lançar gastos.",
      concluido: (contaBancaria as any[]).length > 0,
      ctaLabel: "Cadastrar conta",
      ctaHref: "/contas-cartoes",
    },
    {
      id: "cartao",
      titulo: "1º cartão cadastrado",
      descricao: "Opcional — cadastre um cartão de crédito para organizar faturas e parcelamentos.",
      concluido: (cartao as any[]).length > 0,
      ctaLabel: "Cadastrar cartão",
      ctaHref: "/cartoes",
    },
    {
      id: "orcamento",
      titulo: "1º orçamento (limite de gastos) criado",
      descricao: "Opcional — defina um limite de gastos por categoria e receba um aviso quando estiver perto do teto.",
      concluido: (orcamento as any[]).length > 0,
      ctaLabel: "Criar orçamento",
      ctaHref: "/metas",
    },
  ];
}

async function montarChecklistPJ(userId: number): Promise<ChecklistItem[]> {
  const empresas = await storage.getEmpresasByUsuarioId(userId);
  const empresa = empresas[0];
  if (!empresa) {
    // Sem empresa cadastrada ainda — todos os itens ficam pendentes.
    return itensPJVazios();
  }
  const empresaId = empresa.id;

  const [planoContas, contaBancaria, contaPagar, importacaoExtrato] = await Promise.all([
    db.execute(sql`SELECT 1 FROM empresas_contas WHERE empresa_id = ${empresaId} LIMIT 1`),
    db.execute(sql`SELECT 1 FROM contas_bancarias WHERE empresa_id = ${empresaId} LIMIT 1`),
    db.execute(sql`SELECT 1 FROM empresas_transacoes WHERE empresa_id = ${empresaId} AND data_vencimento IS NOT NULL LIMIT 1`),
    db.execute(sql`SELECT 1 FROM empresas_transacoes WHERE empresa_id = ${empresaId} AND origem = 'importacao' LIMIT 1`),
  ]);

  return [
    {
      id: "plano_contas",
      titulo: "Plano de contas configurado/revisado",
      descricao: "Confira (ou complete com o modelo pronto) as contas de receita e despesa da sua empresa.",
      concluido: (planoContas as any[]).length > 0,
      ctaLabel: "Ver plano de contas",
      ctaHref: "/p/categorias",
    },
    {
      id: "conta_bancaria",
      titulo: "Conta bancária cadastrada",
      descricao: "Cadastre a conta que a empresa usa no dia a dia para acompanhar o saldo real.",
      concluido: (contaBancaria as any[]).length > 0,
      ctaLabel: "Cadastrar conta",
      ctaHref: "/p/contas-bancarias",
    },
    {
      id: "conta_pagar",
      titulo: "1ª conta a pagar criada",
      descricao: "Lance um boleto, PIX ou fatura com vencimento para organizar o fluxo de caixa.",
      concluido: (contaPagar as any[]).length > 0,
      ctaLabel: "Ver vencimentos",
      ctaHref: "/p/vencimentos",
    },
    {
      id: "importacao_extrato",
      titulo: "1ª importação de extrato feita",
      descricao: "Traga o extrato do banco para conciliar automaticamente com o que já foi lançado.",
      concluido: (importacaoExtrato as any[]).length > 0,
      ctaLabel: "Importar extrato",
      ctaHref: "/p/importar-extrato",
    },
  ];
}

function itensPJVazios(): ChecklistItem[] {
  return [
    {
      id: "plano_contas",
      titulo: "Plano de contas configurado/revisado",
      descricao: "Confira (ou complete com o modelo pronto) as contas de receita e despesa da sua empresa.",
      concluido: false,
      ctaLabel: "Ver plano de contas",
      ctaHref: "/p/categorias",
    },
    {
      id: "conta_bancaria",
      titulo: "Conta bancária cadastrada",
      descricao: "Cadastre a conta que a empresa usa no dia a dia para acompanhar o saldo real.",
      concluido: false,
      ctaLabel: "Cadastrar conta",
      ctaHref: "/p/contas-bancarias",
    },
    {
      id: "conta_pagar",
      titulo: "1ª conta a pagar criada",
      descricao: "Lance um boleto, PIX ou fatura com vencimento para organizar o fluxo de caixa.",
      concluido: false,
      ctaLabel: "Ver vencimentos",
      ctaHref: "/p/vencimentos",
    },
    {
      id: "importacao_extrato",
      titulo: "1ª importação de extrato feita",
      descricao: "Traga o extrato do banco para conciliar automaticamente com o que já foi lançado.",
      concluido: false,
      ctaLabel: "Importar extrato",
      ctaHref: "/p/importar-extrato",
    },
  ];
}

/**
 * PF: `transacoes` ganhou a coluna `origem` (espelhando `empresas_transacoes.
 * origem`, que já existia para PJ) justamente para viabilizar este check —
 * ver `server/migrations/auto-migrate.ts` e `shared/schema.ts`.
 */
async function existeLancamentoWhatsappPF(userId: number): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT 1 FROM transacoes t
    JOIN carteiras c ON c.id = t.carteira_id
    WHERE c.usuario_id = ${userId} AND t.origem = 'whatsapp'
    LIMIT 1
  `);
  return (rows as any[]).length > 0;
}
