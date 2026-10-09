/**
 * Importação das contas a receber a partir da conta Cora (modo 'cora').
 *
 * O caminho do nescon-clientes, adaptado ao ERP: lista os boletos da conta
 * (inclusive os emitidos direto no app do Cora), cria a conta a receber de cada
 * um que ainda não existe aqui e deixa `sincronizarCobranca` — que consulta o
 * detalhe, a fonte de verdade — decidir: pago → baixa em Transações na data e
 * no valor pagos; em aberto → fica em Contas a receber; cancelado → some.
 *
 * Idempotente: a cobrança é única por id do Cora (idx_cobr_provedor); título já
 * baixado pelo usuário nunca é baixado de novo; cancelado nunca entra.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { hojeSP } from "../nlp-br";
import { ErroErp } from "../erp/erp.service";
import {
  consultarCobranca, decidirAcao, ehRascunho, janelaImportacao, listarCobrancasApi, LISTAGEM_POR_PAGINA,
  resumoDaListagem, type ResumoCobrancaCora,
} from "./cora.client";
import { credenciais, sincronizarCobranca } from "./cora.service";

const PROVEDOR = "cora";
const MESES = Number(process.env.CORA_IMPORT_MESES) || 6;
const MAX_PAGINAS = 20; // 4000 boletos por rodada é mais que qualquer ME emite
const MAX_NOVAS = 300; // teto de criações por rodada: o job de 30 min não pode travar
const NOME_CONTA_RECEITA = "Recebimentos via Cora";

/** Uma importação por empresa de cada vez (botão e job compartilham). */
const emExecucao = new Set<number>();

export interface ResultadoImportacao {
  listadas: number;
  criadas: number;
  vinculadas: number;
  atualizadas: number;
  baixadas: number;
  canceladas: number;
  ignoradas: number;
  falhas: number;
  em: string;
}

export function importacaoEmAndamento(empresaId: number): boolean {
  return emExecucao.has(empresaId);
}

type Contexto = {
  integ: any;
  contatos: Map<string, number | null>;
  categoriaId: number | null;
};

/** Importa (ou atualiza) tudo que está na janela da conta Cora da empresa. */
export async function importarCobrancas(empresaId: number): Promise<ResultadoImportacao> {
  if (emExecucao.has(empresaId)) throw new ErroErp("Já existe uma importação em andamento para esta empresa.", 409);
  emExecucao.add(empresaId);
  const r: ResultadoImportacao = { listadas: 0, criadas: 0, vinculadas: 0, atualizadas: 0, baixadas: 0, canceladas: 0, ignoradas: 0, falhas: 0, em: new Date().toISOString() };
  try {
    const { cred, integ } = await credenciais(empresaId);
    if (integ.modo_recebimento !== "cora") throw new ErroErp("Esta empresa está no modo manual: escolha 'Importar da API Cora' em Contas a receber.", 409);
    if (integ.status !== "conectada") throw new ErroErp("A conexão com o Cora não está ativa. Teste a conexão antes de importar.", 409);

    const ctx: Contexto = { integ, contatos: new Map(), categoriaId: null };
    const { start, end } = janelaImportacao(hojeSP(), MESES);

    for (let page = 1; page <= MAX_PAGINAS; page++) {
      const itens = await listarCobrancasApi(cred, { start, end, page, perPage: LISTAGEM_POR_PAGINA });
      for (const item of itens) {
        r.listadas++;
        try {
          await processarItem(empresaId, ctx, item, r);
        } catch (e: any) {
          r.falhas++;
          console.error(`[Cora] importar boleto ${item?.id} (empresa ${empresaId}):`, e?.message || e);
        }
      }
      if (itens.length < LISTAGEM_POR_PAGINA) break;
    }
  } finally {
    emExecucao.delete(empresaId);
    r.em = new Date().toISOString();
    await db.execute(sql`
      UPDATE empresas_integracoes SET ultima_importacao = ${JSON.stringify(r)}::jsonb, ultimo_sync_em = now(), atualizado_em = now()
      WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}
    `).catch((e: any) => console.error("[Cora] gravar última importação:", e?.message || e));
  }
  return r;
}

/**
 * Uma cobrança só, a partir do detalhe (usado pelo webhook quando o Cora avisa de
 * um boleto que não conhecemos). Devolve null se a empresa não importa, ou se o
 * boleto não é importável (rascunho, cancelado, sem vencimento).
 */
export async function importarUma(empresaId: number, provedorId: string) {
  const integBasica = ((await db.execute(sql`
    SELECT modo_recebimento, status FROM empresas_integracoes WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}
  `)) as any[])[0];
  if (!integBasica || integBasica.modo_recebimento !== "cora" || integBasica.status !== "conectada") return null;

  const { cred, integ } = await credenciais(empresaId);
  const detalhe = await consultarCobranca(cred, provedorId);
  const resumo = resumoDaListagem(detalhe);
  if (!resumo || ehRascunho(resumo.statusCora) || resumo.status === "cancelada") return null;

  const existente = await cobrancaLocal(empresaId, resumo.id);
  if (existente) return sincronizarCobranca(empresaId, Number(existente.id));

  const criada = await criarCobrancaImportada(empresaId, { integ, contatos: new Map(), categoriaId: null }, resumo, detalhe);
  if (!criada) {
    const corrida = await cobrancaLocal(empresaId, resumo.id);
    return corrida ? sincronizarCobranca(empresaId, Number(corrida.id)) : null;
  }
  return sincronizarCobranca(empresaId, criada.cobrancaId);
}

// ----------------------------------------------------------------------------
// Por item
// ----------------------------------------------------------------------------

async function cobrancaLocal(empresaId: number, provedorId: string) {
  return ((await db.execute(sql`
    SELECT cb.id, cb.status, cb.transacao_id, t.status AS titulo_status
    FROM cobrancas cb LEFT JOIN empresas_transacoes t ON t.id = cb.transacao_id
    WHERE cb.empresa_id = ${empresaId} AND cb.provedor = ${PROVEDOR} AND cb.provedor_id = ${provedorId}
  `)) as any[])[0];
}

async function processarItem(empresaId: number, ctx: Contexto, item: any, r: ResultadoImportacao) {
  const resumo = resumoDaListagem(item);
  if (!resumo || ehRascunho(resumo.statusCora)) { r.ignoradas++; return; }

  const cb = await cobrancaLocal(empresaId, resumo.id);
  const acao = decidirAcao({ existe: !!cb, statusLocal: cb?.status, statusCora: resumo.statusCora, tituloStatus: cb?.titulo_status });

  if (acao === "ignorar") { r.ignoradas++; return; }

  if (acao === "sincronizar") {
    const s = await sincronizarCobranca(empresaId, Number(cb.id));
    r.atualizadas++;
    if (s.baixou) r.baixadas++;
    if (s.apagouTitulo) r.canceladas++;
    return;
  }

  // criar
  if (r.criadas + r.vinculadas >= MAX_NOVAS) { r.ignoradas++; return; }
  const criada = await criarCobrancaImportada(empresaId, ctx, resumo, item);
  if (!criada) { r.ignoradas++; return; } // corrida com o webhook: já entrou por lá
  if (criada.vinculada) r.vinculadas++; else r.criadas++;
  // O detalhe traz linha digitável, Pix, PDF e — se já pagou — a data e o valor da baixa.
  const s = await sincronizarCobranca(empresaId, criada.cobrancaId);
  if (s.baixou) r.baixadas++;
}

/**
 * Cria a conta a receber + a cobrança espelho. Se o usuário já tinha lançado à mão
 * um título igual (mesmo valor, mesmo vencimento, mesmo cliente quando houver, sem
 * cobrança viva), vincula a ele em vez de duplicar. Tudo numa transação: ou
 * título e cobrança entram juntos, ou nada. Devolve null se outra rodada (webhook)
 * já tiver gravado esta cobrança.
 */
async function criarCobrancaImportada(empresaId: number, ctx: Contexto, resumo: ResumoCobrancaCora, payload: unknown): Promise<{ cobrancaId: number; vinculada: boolean } | null> {
  const contatoId = await resolverContato(empresaId, resumo.cliente, ctx.contatos);
  const manual = await tituloManualIgual(empresaId, resumo, contatoId);
  if (!manual && !ctx.categoriaId) ctx.categoriaId = await contaReceitaCora(empresaId);
  const contaBancariaId = Number(ctx.integ.conta_bancaria_id);
  const idem = `cora-import-${resumo.id}`.slice(0, 120);

  try {
    return await db.transaction(async (tx: any) => {
      let tituloId: number;
      if (manual) {
        tituloId = Number(manual.id);
        // O dinheiro vai cair no Cora: o título passa a apontar para essa conta.
        await tx.execute(sql`UPDATE empresas_transacoes SET conta_bancaria_id = ${contaBancariaId}, contato_id = COALESCE(contato_id, ${contatoId}) WHERE id = ${tituloId} AND empresa_id = ${empresaId}`);
      } else {
        const ins = ((await tx.execute(sql`
          INSERT INTO empresas_transacoes
            (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, data_vencimento, status, origem,
             movimenta_caixa, conta_bancaria_id, contato_id)
          VALUES (${empresaId}, ${ctx.categoriaId}, ${resumo.descricao}, ${resumo.valor.toFixed(2)}, 'Receita', ${resumo.vencimento}, ${resumo.vencimento},
                  'Pendente', 'cora', false, ${contaBancariaId}, ${contatoId})
          RETURNING id
        `)) as any[])[0];
        tituloId = Number(ins.id);
      }
      const cb = ((await tx.execute(sql`
        INSERT INTO cobrancas (empresa_id, provedor, provedor_id, transacao_id, contato_id, status, valor, vencimento, idempotency_key, payload)
        VALUES (${empresaId}, ${PROVEDOR}, ${resumo.id}, ${tituloId}, ${contatoId}, 'aberta', ${resumo.valor.toFixed(2)}, ${resumo.vencimento},
                ${idem}, ${JSON.stringify(payload ?? {})}::jsonb)
        RETURNING id
      `)) as any[])[0];
      return { cobrancaId: Number(cb.id), vinculada: !!manual };
    });
  } catch (e: any) {
    if (e?.code === "23505" || /23505|duplicate key/i.test(String(e?.message))) return null;
    throw e;
  }
}

async function tituloManualIgual(empresaId: number, resumo: ResumoCobrancaCora, contatoId: number | null) {
  return ((await db.execute(sql`
    SELECT t.id FROM empresas_transacoes t
    WHERE t.empresa_id = ${empresaId} AND t.tipo = 'Receita' AND t.status = 'Pendente' AND t.origem = 'manual'
      AND t.cartao_id IS NULL AND t.fatura_id IS NULL AND COALESCE(t.reembolso_pessoal, false) = false
      AND t.valor::numeric = ${resumo.valor.toFixed(2)}::numeric
      AND COALESCE(t.data_vencimento, t.data_transacao) = ${resumo.vencimento}::date
      AND (${contatoId}::int IS NULL OR t.contato_id IS NULL OR t.contato_id = ${contatoId})
      AND NOT EXISTS (SELECT 1 FROM cobrancas c WHERE c.transacao_id = t.id AND c.status IN ('aberta', 'processando', 'vencida'))
    ORDER BY (t.contato_id = ${contatoId}) DESC NULLS LAST, t.id
    LIMIT 1
  `)) as any[])[0];
}

/**
 * Cliente do boleto: casa pelo CPF/CNPJ (só dígitos), depois pelo nome; se não
 * existir, cadastra em Clientes com o que o Cora deu (nome, documento, e-mail).
 * Sem nome e sem documento, o título entra sem cliente.
 */
async function resolverContato(empresaId: number, c: ResumoCobrancaCora["cliente"], cache: Map<string, number | null>): Promise<number | null> {
  const chave = c.documento ? `doc:${c.documento}` : c.nome ? `nome:${c.nome.toLowerCase()}` : "";
  if (!chave) return null;
  if (cache.has(chave)) return cache.get(chave)!;

  let achado: any = null;
  if (c.documento) {
    achado = ((await db.execute(sql`
      SELECT id FROM empresas_contatos
      WHERE empresa_id = ${empresaId} AND ativo = true AND regexp_replace(COALESCE(documento, ''), '\\D', '', 'g') = ${c.documento}
      ORDER BY id LIMIT 1
    `)) as any[])[0];
  }
  if (!achado && c.nome) {
    achado = ((await db.execute(sql`
      SELECT id FROM empresas_contatos
      WHERE empresa_id = ${empresaId} AND ativo = true AND lower(nome) = lower(${c.nome})
      ORDER BY id LIMIT 1
    `)) as any[])[0];
  }
  let id: number | null = achado ? Number(achado.id) : null;
  if (id === null) {
    const nome = (c.nome || `Cliente ${c.documento}`).slice(0, 200);
    const novo = ((await db.execute(sql`
      INSERT INTO empresas_contatos (empresa_id, tipo, nome, documento, email)
      VALUES (${empresaId}, 'cliente', ${nome}, ${c.documento}, ${c.email})
      RETURNING id
    `)) as any[])[0];
    id = Number(novo.id);
  }
  cache.set(chave, id);
  return id;
}

/** Conta de receita dos boletos importados; cria "Recebimentos via Cora" no grupo de receita se não existir. */
async function contaReceitaCora(empresaId: number): Promise<number> {
  const contas = (await storage.getEmpresasContasByEmpresaId(empresaId)) as any[];
  const achada = contas.find((c) => c.tipo === "Receita" && !c.sintetica && c.ativo !== false && /recebimentos?.*cora/i.test(String(c.nome)));
  if (achada) return Number(achada.id);
  const nova = await storage.createEmpresaConta({
    empresa_id: empresaId, nome: NOME_CONTA_RECEITA, tipo: "Receita", classificacao: "OUTRA", grupo_gerencial: "receita",
  } as any);
  return Number(nova.id);
}
