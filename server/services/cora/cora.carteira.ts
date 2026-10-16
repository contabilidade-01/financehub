/**
 * Carteira Nescon: parâmetro exclusivo do escritório na integração Cora.
 *
 * Com `empresas_integracoes.filtro_clientes = 'carteira_nescon'`, a importação dos
 * boletos só cria conta a receber para clientes marcados 'nescon' no portal
 * nescon-clientes. A lista vem de GET {NESCON_PORTAL_URL}/api/interno/clientes-carteira
 * (Bearer NESCON_PORTAL_TOKEN = INTERNAL_API_TOKEN do portal), fica espelhada em
 * `cora_carteira_clientes` e alimenta o cadastro de Clientes (empresas_contatos).
 *
 * Falha fechada: se o portal não responde, vale o último espelho; sem espelho
 * nenhum, nada é importado — boleto pessoal nunca cai nas transações do escritório.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { ErroErp } from "../erp/erp.service";
import { filtroValido, normalizarClientesPortal, type ClientePortal, type FiltroClientes } from "./carteira-nescon";

const PROVEDOR = "cora";
const TIMEOUT_MS = 20_000;

export interface ResumoCarteira {
  nescon: number;
  jean: number;
  contatos_criados: number;
  contatos_atualizados: number;
  erro: string | null;
  em: string;
}

function configPortal(): { url: string; token: string } | null {
  const url = (process.env.NESCON_PORTAL_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.NESCON_PORTAL_TOKEN || "").trim();
  return url && token ? { url, token } : null;
}

export function portalConfigurado(): boolean {
  return configPortal() !== null;
}

async function buscarClientesPortal(): Promise<ClientePortal[]> {
  const cfg = configPortal();
  if (!cfg) throw new ErroErp("Portal nescon-clientes não configurado (NESCON_PORTAL_URL e NESCON_PORTAL_TOKEN).", 503);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${cfg.url}/api/interno/clientes-carteira`, {
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new ErroErp(`Portal nescon-clientes respondeu ${r.status} ao listar a carteira.`, 502);
    return normalizarClientesPortal(await r.json());
  } catch (e: any) {
    if (e instanceof ErroErp) throw e;
    throw new ErroErp(`Portal nescon-clientes indisponível: ${e?.name === "AbortError" ? "tempo esgotado" : e?.message || e}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Baixa a carteira do portal, troca o espelho da empresa e completa o cadastro de
 * Clientes com os clientes Nescon (cria quem falta; só preenche e-mail/telefone vazios).
 * Lista vazia não substitui o espelho: é mais provável erro do portal do que
 * escritório sem cliente.
 */
export async function sincronizarCarteira(empresaId: number): Promise<ResumoCarteira> {
  const resumo: ResumoCarteira = { nescon: 0, jean: 0, contatos_criados: 0, contatos_atualizados: 0, erro: null, em: new Date().toISOString() };
  try {
    const clientes = await buscarClientesPortal();
    if (!clientes.length) throw new ErroErp("Portal nescon-clientes devolveu a carteira vazia; espelho anterior mantido.", 502);

    await db.transaction(async (tx: any) => {
      await tx.execute(sql`DELETE FROM cora_carteira_clientes WHERE empresa_id = ${empresaId}`);
      for (const c of clientes) {
        await tx.execute(sql`
          INSERT INTO cora_carteira_clientes (empresa_id, documento, nome, email, telefone, carteira, inativo, sincronizado_em)
          VALUES (${empresaId}, ${c.documento}, ${c.nome}, ${c.email}, ${c.telefone}, ${c.carteira}, ${c.inativo}, now())
        `);
        if (c.carteira === "nescon") resumo.nescon++; else resumo.jean++;
      }
    });

    for (const c of clientes) {
      if (c.carteira !== "nescon" || c.inativo) continue;
      const existente = ((await db.execute(sql`
        SELECT id, email, telefone FROM empresas_contatos
        WHERE empresa_id = ${empresaId} AND regexp_replace(COALESCE(documento, ''), '\\D', '', 'g') = ${c.documento}
        ORDER BY ativo DESC, id LIMIT 1
      `)) as any[])[0];
      if (!existente) {
        await db.execute(sql`
          INSERT INTO empresas_contatos (empresa_id, tipo, nome, documento, email, telefone)
          VALUES (${empresaId}, 'cliente', ${(c.nome || `Cliente ${c.documento}`).slice(0, 200)}, ${c.documento}, ${c.email}, ${c.telefone})
        `);
        resumo.contatos_criados++;
      } else if ((!existente.email && c.email) || (!existente.telefone && c.telefone)) {
        await db.execute(sql`
          UPDATE empresas_contatos SET email = COALESCE(email, ${c.email}), telefone = COALESCE(telefone, ${c.telefone})
          WHERE id = ${existente.id}
        `);
        resumo.contatos_atualizados++;
      }
    }
  } catch (e: any) {
    resumo.erro = String(e?.message || e).slice(0, 300);
    throw e;
  } finally {
    resumo.em = new Date().toISOString();
    await db.execute(sql`
      UPDATE empresas_integracoes
      SET carteira_sync_resumo = ${JSON.stringify(resumo)}::jsonb,
          carteira_sync_em = CASE WHEN ${resumo.erro}::text IS NULL THEN now() ELSE carteira_sync_em END
      WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}
    `).catch((e: any) => console.error("[Cora] gravar resumo da carteira:", e?.message || e));
  }
  return resumo;
}

/** Espelho atual: documento → carteira. */
export async function carregarCarteira(empresaId: number): Promise<Map<string, string>> {
  const linhas = (await db.execute(sql`SELECT documento, carteira FROM cora_carteira_clientes WHERE empresa_id = ${empresaId}`)) as any[];
  return new Map(linhas.map((l) => [String(l.documento), String(l.carteira)]));
}

/**
 * Para a importação: null = sem filtro (importa tudo). Com o filtro, tenta
 * atualizar a carteira (falha só registra) e devolve o espelho; espelho vazio
 * interrompe a importação.
 */
export async function carteiraParaImportar(empresaId: number, integ: { filtro_clientes?: unknown }, o: { atualizar: boolean }): Promise<Map<string, string> | null> {
  if (filtroValido(integ.filtro_clientes) !== "carteira_nescon") return null;
  if (o.atualizar) {
    await sincronizarCarteira(empresaId).catch((e: any) => console.error(`[Cora] carteira Nescon (empresa ${empresaId}):`, e?.message || e));
  }
  const carteira = await carregarCarteira(empresaId);
  if (!carteira.size) throw new ErroErp("Carteira de clientes do portal ainda não sincronizada: nenhum boleto importado.", 409);
  return carteira;
}

export async function obterCarteira(empresaId: number) {
  const i = ((await db.execute(sql`
    SELECT filtro_clientes, carteira_sync_em, carteira_sync_resumo FROM empresas_integracoes
    WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}
  `)) as any[])[0];
  const totais = ((await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE carteira = 'nescon')::int AS nescon, COUNT(*) FILTER (WHERE carteira = 'jean')::int AS jean
    FROM cora_carteira_clientes WHERE empresa_id = ${empresaId}
  `)) as any[])[0];
  return {
    conectada: !!i,
    portal_configurado: portalConfigurado(),
    filtro_clientes: filtroValido(i?.filtro_clientes),
    sincronizado_em: i?.carteira_sync_em ?? null,
    ultimo_resumo: i?.carteira_sync_resumo ?? null,
    clientes_nescon: Number(totais?.nescon) || 0,
    clientes_jean: Number(totais?.jean) || 0,
  };
}

/** Liga/desliga o filtro. Ligar exige uma sincronização bem-sucedida antes. */
export async function definirFiltro(empresaId: number, filtroBruto: unknown) {
  if (filtroBruto !== "todos" && filtroBruto !== "carteira_nescon") throw new ErroErp("Filtro inválido: use 'todos' ou 'carteira_nescon'.");
  const filtro = filtroBruto as FiltroClientes;
  const integ = ((await db.execute(sql`SELECT id FROM empresas_integracoes WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}`)) as any[])[0];
  if (!integ) throw new ErroErp("Conecte a conta Cora antes de escolher o filtro.", 409);
  if (filtro === "carteira_nescon") await sincronizarCarteira(empresaId);
  await db.execute(sql`
    UPDATE empresas_integracoes SET filtro_clientes = ${filtro}, atualizado_em = now()
    WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}
  `);
  return obterCarteira(empresaId);
}
