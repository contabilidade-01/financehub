/**
 * Contas a pagar e a receber (títulos) do ERP PJ ME.
 *
 * Um título é um lançamento em empresas_transacoes: Despesa = a pagar,
 * Receita = a receber. Pendente = em aberto; a baixa (individual ou em lote)
 * o transforma no lançamento realizado — Efetivada, com data de pagamento e o
 * banco por onde o dinheiro passou — e é isso que alimenta caixa, DRE,
 * projeção e dashboard. Juros, multas e descontos na baixa viram lançamentos
 * complementares nas contas do resultado financeiro, ligados ao título.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { hojeSP, somarDias } from "../nlp-br";
import { ErroErp, validarVinculos, dividirParcelas, vencimentoDaParcela } from "./erp.service";

export type TipoTitulo = "Receita" | "Despesa";

export interface FiltrosTitulos {
  status?: string; // aberto | vencido | a_vencer | pago | todos
  de?: string; // vencimento
  ate?: string;
  pago_de?: string; // data de pagamento
  pago_ate?: string;
  contato_id?: number | null;
  categoria_id?: number | null;
  centro_custo_id?: number | null;
  conta_bancaria_id?: number | null;
  q?: string;
  valor_min?: number | null;
  valor_max?: number | null;
}

const iso = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const inteiro = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));
/** "1.234,56", "1234.56" ou número → 1234.56 (NaN se inválido). */
export function dinheiro(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  let t = String(v ?? "").trim().replace(/[R$\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return t && Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Somente o que é título: fora compra no cartão (vai na fatura) e reembolso pessoal. */
const E_TITULO = sql`t.cartao_id IS NULL AND t.fatura_id IS NULL AND COALESCE(t.reembolso_pessoal, false) = false`;

/** Faixa de atraso (aging) de um título em aberto. */
export function faixaAging(vencimento: string, hoje: string): "a_vencer" | "1_30" | "31_60" | "61_90" | "90_mais" {
  if (vencimento >= hoje) return "a_vencer";
  const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${vencimento}T12:00:00Z`)) / 86_400_000);
  if (dias <= 30) return "1_30";
  if (dias <= 60) return "31_60";
  if (dias <= 90) return "61_90";
  return "90_mais";
}

/**
 * Diferença entre o valor pago e o previsto na baixa: vira lançamento
 * complementar no resultado financeiro. Pagar mais = juros/multa pagos;
 * pagar menos = desconto obtido; receber mais = juros recebidos;
 * receber menos = desconto concedido.
 */
export function diferencaDaBaixa(tipo: TipoTitulo, previsto: number, pago: number):
  | null
  | { chave: "juros_pagos" | "desconto_obtido" | "juros_recebidos" | "desconto_concedido"; tipo: TipoTitulo; valor: number } {
  const dif = r2(pago - previsto);
  if (Math.abs(dif) < 0.01) return null;
  if (tipo === "Despesa") {
    return dif > 0 ? { chave: "juros_pagos", tipo: "Despesa", valor: dif } : { chave: "desconto_obtido", tipo: "Receita", valor: -dif };
  }
  return dif > 0 ? { chave: "juros_recebidos", tipo: "Receita", valor: dif } : { chave: "desconto_concedido", tipo: "Despesa", valor: -dif };
}

const CONTA_FINANCEIRA: Record<string, { nome: string; tipo: TipoTitulo; re: RegExp }> = {
  juros_pagos: { nome: "Juros e multas pagos", tipo: "Despesa", re: /juros.*pag|multa/i },
  desconto_obtido: { nome: "Descontos obtidos", tipo: "Receita", re: /desconto.*obtid/i },
  juros_recebidos: { nome: "Juros e multas recebidos", tipo: "Receita", re: /juros.*receb/i },
  desconto_concedido: { nome: "Descontos concedidos", tipo: "Despesa", re: /desconto.*conced/i },
};

/** Conta do resultado financeiro para a diferença; cria no grupo financeiro se não existir. */
async function contaFinanceira(empresaId: number, chave: keyof typeof CONTA_FINANCEIRA): Promise<number> {
  const alvo = CONTA_FINANCEIRA[chave];
  const contas = (await storage.getEmpresasContasByEmpresaId(empresaId)) as any[];
  const achada = contas.find((c) => c.tipo === alvo.tipo && alvo.re.test(c.nome));
  if (achada) return achada.id;
  const nova = await storage.createEmpresaConta({
    empresa_id: empresaId, nome: alvo.nome, tipo: alvo.tipo, classificacao: "OUTRA", grupo_gerencial: "financeiro",
  } as any);
  return nova.id;
}

// ----------------------------------------------------------------------------
// Listagem com filtros
// ----------------------------------------------------------------------------

export async function listarTitulos(empresaId: number, tipo: TipoTitulo, f: FiltrosTitulos = {}) {
  const hoje = hojeSP();
  const st = String(f.status || "aberto");
  const venc = sql`COALESCE(t.data_vencimento, t.data_transacao)`;
  const filtroStatus =
    st === "pago" ? sql`t.status = 'Efetivada'`
    : st === "vencido" ? sql`t.status = 'Pendente' AND ${venc} < ${hoje}::date`
    : st === "a_vencer" ? sql`t.status = 'Pendente' AND ${venc} >= ${hoje}::date`
    : st === "todos" ? sql`true`
    : sql`t.status = 'Pendente'`;
  const termo = String(f.q || "").trim().slice(0, 80);

  const linhas = (await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.status, t.data_transacao, t.data_vencimento, t.data_pagamento,
           t.parcela_num, t.parcela_total, t.compra_grupo, t.conta_bancaria_id, t.contato_id, t.centro_custo_id,
           t.categoria_id, t.origem, COALESCE(t.conciliado, false) AS conciliado,
           ec.codigo AS conta_codigo, ec.nome AS conta_nome, c.nome AS contato_nome, cc.nome AS centro_nome,
           COALESCE(cb.nome, cb.banco) AS conta_bancaria_nome
    FROM empresas_transacoes t
    LEFT JOIN empresas_contas ec ON ec.id = t.categoria_id
    LEFT JOIN empresas_contatos c ON c.id = t.contato_id
    LEFT JOIN empresas_centros_custo cc ON cc.id = t.centro_custo_id
    LEFT JOIN contas_bancarias cb ON cb.id = t.conta_bancaria_id
    WHERE t.empresa_id = ${empresaId}
      AND t.tipo = ${tipo}
      AND ${E_TITULO}
      AND ${filtroStatus}
      AND (${iso(f.de)}::date IS NULL OR ${venc} >= ${iso(f.de)}::date)
      AND (${iso(f.ate)}::date IS NULL OR ${venc} <= ${iso(f.ate)}::date)
      AND (${iso(f.pago_de)}::date IS NULL OR t.data_pagamento >= ${iso(f.pago_de)}::date)
      AND (${iso(f.pago_ate)}::date IS NULL OR t.data_pagamento <= ${iso(f.pago_ate)}::date)
      AND (${f.contato_id ?? null}::int IS NULL OR t.contato_id = ${f.contato_id ?? null})
      AND (${f.categoria_id ?? null}::int IS NULL OR t.categoria_id = ${f.categoria_id ?? null})
      AND (${f.centro_custo_id ?? null}::int IS NULL OR t.centro_custo_id = ${f.centro_custo_id ?? null})
      AND (${f.conta_bancaria_id ?? null}::int IS NULL OR t.conta_bancaria_id = ${f.conta_bancaria_id ?? null})
      AND (${f.valor_min ?? null}::numeric IS NULL OR t.valor::numeric >= ${f.valor_min ?? null})
      AND (${f.valor_max ?? null}::numeric IS NULL OR t.valor::numeric <= ${f.valor_max ?? null})
      AND (${termo} = '' OR t.descricao ILIKE ${"%" + termo + "%"} OR c.nome ILIKE ${"%" + termo + "%"})
    ORDER BY ${venc} ASC, t.id
    LIMIT 2000
  `)) as any[];

  const em7 = somarDias(hoje, 7);
  const resumo = { total_aberto: 0, vencido: 0, vence_7_dias: 0, pago: 0, qtd_aberto: 0, qtd_vencido: 0 };
  const aging = { a_vencer: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_mais": 0 };
  for (const l of linhas) {
    const v = Number(l.valor);
    const vc = String(l.data_vencimento || l.data_transacao).slice(0, 10);
    if (l.status === "Pendente") {
      resumo.total_aberto += v;
      resumo.qtd_aberto++;
      if (vc < hoje) { resumo.vencido += v; resumo.qtd_vencido++; }
      else if (vc <= em7) resumo.vence_7_dias += v;
      aging[faixaAging(vc, hoje)] += v;
    } else resumo.pago += v;
  }
  for (const k of Object.keys(resumo) as (keyof typeof resumo)[]) if (!k.startsWith("qtd")) resumo[k] = r2(resumo[k]);
  for (const k of Object.keys(aging) as (keyof typeof aging)[]) aging[k] = r2(aging[k]);
  return { linhas, resumo, aging, hoje };
}

// ----------------------------------------------------------------------------
// Criação: parcelado, recorrente ou já pago
// ----------------------------------------------------------------------------

export async function criarTitulo(empresaId: number, tipo: TipoTitulo, b: any) {
  const descricao = String(b.descricao ?? "").trim().slice(0, 240);
  if (!descricao) throw new ErroErp("Informe a descrição.");
  const valorInformado = dinheiro(b.valor);
  if (!(valorInformado > 0) || valorInformado > 99_999_999) throw new ErroErp("Informe um valor válido.");
  const venc = String(b.data_vencimento || "");
  if (!iso(venc)) throw new ErroErp("Informe a data de vencimento.");
  const modo = b.recorrencia === "mensal" ? "recorrente" : "parcelas";
  const n = Math.min(60, Math.max(1, Math.trunc(Number(modo === "recorrente" ? b.meses : b.parcelas) || 1)));
  const v = await validarVinculos(empresaId, b);
  if (!v.categoria_id) throw new ErroErp(`Escolha a conta de ${tipo === "Receita" ? "receita" : "despesa"} do plano de contas.`);
  const conta = (await db.execute(sql`SELECT tipo FROM empresas_contas WHERE id = ${v.categoria_id}`)) as any[];
  if (conta[0]?.tipo !== tipo) throw new ErroErp(`A conta escolhida precisa ser de ${tipo === "Receita" ? "receita" : "despesa"}.`);
  const competencia = iso(b.data_competencia) ?? hojeSP();

  // "Já pago/recebido": nasce realizado, direto no banco (só faz sentido à vista).
  const jaPago = b.ja_pago === true || b.ja_pago === "true";
  if (jaPago && n > 1) throw new ErroErp("Lançamento já pago não pode ser parcelado ou recorrente.");
  if (jaPago && !v.conta_bancaria_id) throw new ErroErp("Escolha a conta bancária por onde o dinheiro passou.");
  const dataPagamento = jaPago ? iso(b.data_pagamento) ?? venc : null;

  // Parcelado: divide o total; recorrente: repete o valor todo mês.
  const valores = modo === "recorrente" ? Array.from({ length: n }, () => valorInformado)
    : b.valor_modo === "parcela" ? Array.from({ length: n }, () => valorInformado) : dividirParcelas(valorInformado, n);
  const prefixo = tipo === "Receita" ? "rec" : "pag";
  const grupo = n > 1 ? `${prefixo}-${Date.now().toString(36)}` : null;

  return db.transaction(async (tx: any) => {
    const criados: any[] = [];
    for (let i = 0; i < n; i++) {
      const vencI = vencimentoDaParcela(venc, i);
      // Competência acompanha o mês de cada ocorrência na recorrência (aluguel de março é de março).
      const compI = modo === "recorrente" ? vencimentoDaParcela(competencia, i) : competencia;
      const sufixo = n > 1 ? ` (${i + 1}/${n})` : "";
      const r = (await tx.execute(sql`
        INSERT INTO empresas_transacoes
          (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, data_vencimento, data_pagamento, status, origem,
           movimenta_caixa, conta_bancaria_id, contato_id, centro_custo_id, compra_grupo, parcela_num, parcela_total)
        VALUES (${empresaId}, ${v.categoria_id}, ${descricao + sufixo}, ${valores[i].toFixed(2)}, ${tipo}, ${compI}, ${vencI},
                ${dataPagamento}, ${jaPago ? "Efetivada" : "Pendente"}, 'manual',
                ${jaPago}, ${v.conta_bancaria_id}, ${v.contato_id}, ${v.centro_custo_id}, ${grupo},
                ${n > 1 ? i + 1 : null}, ${n > 1 ? n : null})
        RETURNING id, descricao, valor, data_vencimento, status
      `)) as any[];
      criados.push(r[0]);
    }
    return { criados };
  });
}

// ----------------------------------------------------------------------------
// Baixa (individual ou em lote) e estorno
// ----------------------------------------------------------------------------

export interface ItemBaixa {
  id: number;
  /** Só na baixa individual: valor efetivamente pago/recebido (juros ou desconto). */
  valor_pago?: number | string | null;
}

export async function baixarTitulos(
  empresaId: number,
  itens: ItemBaixa[],
  opcoes: { data_pagamento?: string; conta_bancaria_id?: unknown },
) {
  if (!Array.isArray(itens) || !itens.length) throw new ErroErp("Selecione ao menos um lançamento.");
  if (itens.length > 500) throw new ErroErp("No máximo 500 lançamentos por vez.");
  const v = await validarVinculos(empresaId, { conta_bancaria_id: opcoes.conta_bancaria_id });
  if (!v.conta_bancaria_id) throw new ErroErp("Escolha a conta bancária.");
  const data = iso(opcoes.data_pagamento) ?? hojeSP();
  const ids = [...new Set(itens.map((i) => inteiro(i.id)).filter((x): x is number => x !== null))];
  if (!ids.length) throw new ErroErp("Selecione ao menos um lançamento.");

  const lista = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  const titulos = (await db.execute(sql`
    SELECT t.id, t.tipo, t.status, t.valor, t.descricao, t.contato_id, t.centro_custo_id
    FROM empresas_transacoes t
    WHERE t.empresa_id = ${empresaId} AND t.id IN (${lista}) AND ${E_TITULO}
  `)) as any[];
  const porId = new Map(titulos.map((t) => [Number(t.id), t]));

  // Valida tudo antes de gravar: ou o lote inteiro entra, ou nada.
  const falhas: { id: number; motivo: string }[] = [];
  const complementos: { tituloId: number; dif: NonNullable<ReturnType<typeof diferencaDaBaixa>> }[] = [];
  for (const id of ids) {
    const t = porId.get(id);
    if (!t) { falhas.push({ id, motivo: "Lançamento não encontrado." }); continue; }
    if (t.status !== "Pendente") { falhas.push({ id, motivo: "Já está baixado." }); continue; }
    const item = itens.find((i) => inteiro(i.id) === id);
    if (item?.valor_pago !== undefined && item.valor_pago !== null && item.valor_pago !== "") {
      const pago = dinheiro(item.valor_pago);
      if (!(pago > 0)) { falhas.push({ id, motivo: "Valor pago inválido." }); continue; }
      const dif = diferencaDaBaixa(t.tipo, Number(t.valor), pago);
      if (dif) complementos.push({ tituloId: id, dif });
    }
  }
  if (falhas.length) throw Object.assign(new ErroErp(falhas.length === 1 ? falhas[0].motivo : `${falhas.length} lançamento(s) não podem ser baixados.`), { falhas });

  // Contas financeiras resolvidas (ou criadas) antes da transação.
  const contaDe = new Map<string, number>();
  for (const c of complementos) if (!contaDe.has(c.dif.chave)) contaDe.set(c.dif.chave, await contaFinanceira(empresaId, c.dif.chave));

  return db.transaction(async (tx: any) => {
    await tx.execute(sql`
      UPDATE empresas_transacoes
      SET status = 'Efetivada', data_pagamento = ${data}, movimenta_caixa = true, conta_bancaria_id = ${v.conta_bancaria_id}
      WHERE empresa_id = ${empresaId} AND id IN (${lista}) AND status = 'Pendente'
    `);
    for (const c of complementos) {
      const t = porId.get(c.tituloId)!;
      const rotulo = { juros_pagos: "Juros/multa", desconto_obtido: "Desconto obtido", juros_recebidos: "Juros/multa recebidos", desconto_concedido: "Desconto concedido" }[c.dif.chave];
      await tx.execute(sql`
        INSERT INTO empresas_transacoes
          (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, data_pagamento, status, origem,
           movimenta_caixa, conta_bancaria_id, contato_id, centro_custo_id, compra_grupo)
        VALUES (${empresaId}, ${contaDe.get(c.dif.chave)}, ${`${rotulo} — ${String(t.descricao).slice(0, 200)}`}, ${c.dif.valor.toFixed(2)},
                ${c.dif.tipo}, ${data}, ${data}, 'Efetivada', 'baixa', true, ${v.conta_bancaria_id},
                ${t.contato_id}, ${t.centro_custo_id}, ${`baixa-${c.tituloId}`})
      `);
    }
    return { baixados: ids.length, complementos: complementos.length, data_pagamento: data };
  });
}

/** Estorno: o título volta a ficar em aberto e os complementos da baixa são desfeitos. */
export async function estornarTitulos(empresaId: number, idsBrutos: unknown[]) {
  const ids = [...new Set((idsBrutos || []).map(inteiro).filter((x): x is number => x !== null))];
  if (!ids.length) throw new ErroErp("Selecione ao menos um lançamento.");
  const lista = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  const rows = (await db.execute(sql`
    SELECT id, status, COALESCE(conciliado, false) AS conciliado FROM empresas_transacoes t
    WHERE empresa_id = ${empresaId} AND id IN (${lista}) AND ${E_TITULO}
  `)) as any[];
  if (rows.length !== ids.length) throw new ErroErp("Lançamento não encontrado.", 404);
  if (rows.some((r) => r.status !== "Efetivada")) throw new ErroErp("Só dá para estornar o que já foi baixado.");
  if (rows.some((r) => r.conciliado === true || r.conciliado === "true")) {
    throw new ErroErp("Há lançamento conciliado com o extrato. Desfaça a conciliação antes de estornar.");
  }
  const grupos = sql.join(ids.map((id) => sql`${`baixa-${id}`}`), sql`, `);
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`
      UPDATE empresas_transacoes SET status = 'Pendente', data_pagamento = NULL, movimenta_caixa = false
      WHERE empresa_id = ${empresaId} AND id IN (${lista})
    `);
    // Complementos gerados pela baixa (origem 'baixa') não têm sentido sem ela.
    await tx.execute(sql`
      DELETE FROM empresas_transacoes WHERE empresa_id = ${empresaId} AND origem = 'baixa' AND compra_grupo IN (${grupos})
    `);
    return { estornados: ids.length };
  });
}
