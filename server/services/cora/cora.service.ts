/**
 * Recebimentos via Cora (PJ ME): conexão por empresa, emissão de cobrança
 * boleto + Pix a partir de contas a receber, e baixa automática quando o
 * cliente paga (webhook confirmado na API + sincronização periódica).
 *
 * Regra de segurança: o conteúdo do webhook nunca é aceito como verdade — ele
 * só diz "olhe a cobrança X"; o status vem de uma consulta autenticada ao Cora.
 */
import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { cifrar, decifrar, hashToken } from "../../utils/cripto-segredos";
import { ErroErp } from "../erp/erp.service";
import { baixarTitulos, criarTitulo } from "../erp/titulos.service";
import {
  cancelarCobranca, consultarCobranca, dadosDePagamento, dadosDoPagamento, emitirCobranca, esquecerToken,
  mapearStatus, montarPayloadCobranca, obterToken, pendenciasDoCliente, registrarWebhook,
  type AmbienteCora, type CredenciaisCora, ErroCora,
} from "./cora.client";

const PROVEDOR = "cora";
const r2 = (n: number) => Math.round(n * 100) / 100;

// ----------------------------------------------------------------------------
// Conexão (credenciais da empresa)
// ----------------------------------------------------------------------------

/** Dados da conexão sem nenhum segredo (é o que a tela recebe). */
export async function obterConexao(empresaId: number) {
  const i = ((await db.execute(sql`
    SELECT id, ambiente, client_id, conta_bancaria_id, status, ultimo_erro, webhook_registrado, multa_pct, juros_mes_pct,
           ultimo_sync_em, atualizado_em, (certificado_enc IS NOT NULL) AS tem_certificado, (chave_enc IS NOT NULL) AS tem_chave
    FROM empresas_integracoes WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}
  `)) as any[])[0];
  return i ? { ...i, multa_pct: Number(i.multa_pct ?? 2), juros_mes_pct: Number(i.juros_mes_pct ?? 1) } : null;
}

const PEM_CERT = /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/;
const PEM_CHAVE = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]+-----END (?:RSA |EC )?PRIVATE KEY-----/;

/** Conta bancária "Cora" da empresa (cria se não existir): é onde os recebimentos caem. */
async function contaCora(empresaId: number, informada?: unknown): Promise<number> {
  if (informada) {
    const r = ((await db.execute(sql`SELECT id FROM contas_bancarias WHERE id = ${Number(informada)} AND empresa_id = ${empresaId}`)) as any[])[0];
    if (!r) throw new ErroErp("Conta bancária inválida.");
    return Number(r.id);
  }
  const achada = ((await db.execute(sql`
    SELECT id FROM contas_bancarias WHERE empresa_id = ${empresaId} AND ativo = true AND (banco ILIKE '%cora%' OR nome ILIKE '%cora%')
    ORDER BY id LIMIT 1
  `)) as any[])[0];
  if (achada) return Number(achada.id);
  const emp = ((await db.execute(sql`SELECT usuario_id FROM empresas WHERE id = ${empresaId}`)) as any[])[0];
  const nova = ((await db.execute(sql`
    INSERT INTO contas_bancarias (usuario_id, empresa_id, nome, banco, tipo, saldo_inicial, ativo)
    VALUES (${emp.usuario_id}, ${empresaId}, 'Cora', 'Cora', 'corrente', 0, true)
    RETURNING id
  `)) as any[])[0];
  return Number(nova.id);
}

export async function salvarConexao(empresaId: number, b: any) {
  const ambiente: AmbienteCora = b.ambiente === "producao" ? "producao" : "stage";
  const clientId = String(b.client_id || "").trim();
  if (clientId.length < 4 || clientId.length > 200) throw new ErroErp("Informe o Client ID gerado no app do Cora.");
  const atual = ((await db.execute(sql`SELECT certificado_enc, chave_enc FROM empresas_integracoes WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}`)) as any[])[0];

  // Certificado e chave: obrigatórios na primeira vez; depois, só se trocar.
  const cert = String(b.certificado || "").trim();
  const chave = String(b.chave || "").trim();
  if (cert && !PEM_CERT.test(cert)) throw new ErroErp("O certificado precisa estar no formato PEM (-----BEGIN CERTIFICATE-----).");
  if (chave && !PEM_CHAVE.test(chave)) throw new ErroErp("A chave privada precisa estar no formato PEM (-----BEGIN PRIVATE KEY-----).");
  if (!atual && (!cert || !chave)) throw new ErroErp("Envie o certificado e a chave privada.");

  const multa = Math.min(2, Math.max(0, Number(String(b.multa_pct ?? 2).replace(",", ".")) || 0));
  const juros = Math.min(10, Math.max(0, Number(String(b.juros_mes_pct ?? 1).replace(",", ".")) || 0));
  const contaId = await contaCora(empresaId, b.conta_bancaria_id);
  const certEnc = cert ? cifrar(cert) : atual?.certificado_enc;
  const chaveEnc = chave ? cifrar(chave) : atual?.chave_enc;

  await db.execute(sql`
    INSERT INTO empresas_integracoes (empresa_id, provedor, ambiente, client_id, certificado_enc, chave_enc, conta_bancaria_id, status, multa_pct, juros_mes_pct)
    VALUES (${empresaId}, ${PROVEDOR}, ${ambiente}, ${clientId}, ${certEnc}, ${chaveEnc}, ${contaId}, 'pendente', ${multa}, ${juros})
    ON CONFLICT (empresa_id, provedor) DO UPDATE SET
      ambiente = EXCLUDED.ambiente, client_id = EXCLUDED.client_id, certificado_enc = EXCLUDED.certificado_enc,
      chave_enc = EXCLUDED.chave_enc, conta_bancaria_id = EXCLUDED.conta_bancaria_id, status = 'pendente', ultimo_erro = NULL,
      multa_pct = EXCLUDED.multa_pct, juros_mes_pct = EXCLUDED.juros_mes_pct, atualizado_em = now(),
      webhook_registrado = CASE WHEN empresas_integracoes.ambiente = EXCLUDED.ambiente AND empresas_integracoes.client_id = EXCLUDED.client_id
                                THEN empresas_integracoes.webhook_registrado ELSE false END
  `);
  esquecerToken({ ambiente, clientId });
  // Testa já: a pessoa sai da tela sabendo se funcionou.
  return testarConexao(empresaId);
}

export async function removerConexao(empresaId: number) {
  await db.execute(sql`DELETE FROM empresas_integracoes WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}`);
  return { removida: true };
}

async function credenciais(empresaId: number): Promise<{ cred: CredenciaisCora; integ: any }> {
  const integ = ((await db.execute(sql`SELECT * FROM empresas_integracoes WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}`)) as any[])[0];
  if (!integ?.certificado_enc || !integ?.chave_enc || !integ?.client_id) throw new ErroErp("Conecte a conta Cora em Recebimentos Cora → Conexão.", 409);
  return {
    integ,
    cred: { ambiente: integ.ambiente === "producao" ? "producao" : "stage", clientId: integ.client_id, certificado: decifrar(integ.certificado_enc), chave: decifrar(integ.chave_enc) },
  };
}

async function marcarStatus(empresaId: number, status: "conectada" | "erro", erro: string | null) {
  await db.execute(sql`
    UPDATE empresas_integracoes SET status = ${status}, ultimo_erro = ${erro}, atualizado_em = now()
    WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}
  `);
}

export async function testarConexao(empresaId: number) {
  const { cred } = await credenciais(empresaId);
  try {
    esquecerToken(cred);
    await obterToken(cred);
    await marcarStatus(empresaId, "conectada", null);
  } catch (e: any) {
    await marcarStatus(empresaId, "erro", e?.message || "Falha ao conectar.");
  }
  return obterConexao(empresaId);
}

/** Registra no Cora a URL desta empresa para os eventos de pagamento e cancelamento. */
export async function ativarWebhook(empresaId: number, baseUrl: string) {
  if (!/^https:\/\//.test(baseUrl) && process.env.NODE_ENV === "production") {
    throw new ErroErp("BASE_URL precisa ser https para receber avisos do Cora.");
  }
  const { cred } = await credenciais(empresaId);
  const token = randomBytes(24).toString("base64url");
  const url = `${baseUrl.replace(/\/+$/, "")}/api/webhooks/cora/${token}`;
  await registrarWebhook(cred, url, "paid");
  await registrarWebhook(cred, url, "canceled");
  await db.execute(sql`
    UPDATE empresas_integracoes SET webhook_token_hash = ${hashToken(token)}, webhook_registrado = true, atualizado_em = now()
    WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}
  `);
  return obterConexao(empresaId);
}

// ----------------------------------------------------------------------------
// Cobranças
// ----------------------------------------------------------------------------

export interface ResultadoEmissao {
  transacao_id: number;
  ok: boolean;
  cobranca_id?: number;
  erro?: string;
}

/** Emite cobrança Cora para contas a receber (uma por título; o banco trava duplicidade). */
export async function emitirParaTitulos(empresaId: number, idsBrutos: unknown[], o: { desconto_pct?: number | null; formas?: ("BANK_SLIP" | "PIX")[] } = {}) {
  const ids = [...new Set((idsBrutos || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100);
  if (!ids.length) throw new ErroErp("Selecione ao menos uma conta a receber.");
  const { cred, integ } = await credenciais(empresaId);
  if (integ.status !== "conectada") throw new ErroErp("A conexão com o Cora não está ativa. Teste a conexão antes de emitir.", 409);

  const lista = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  const titulos = (await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.tipo, t.status, COALESCE(t.data_vencimento, t.data_transacao) AS venc, t.contato_id,
           c.nome, c.documento, c.email, c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf
    FROM empresas_transacoes t
    LEFT JOIN empresas_contatos c ON c.id = t.contato_id
    WHERE t.empresa_id = ${empresaId} AND t.id IN (${lista})
  `)) as any[];

  const resultados: ResultadoEmissao[] = [];
  for (const id of ids) {
    const t = titulos.find((x) => Number(x.id) === id);
    const falhar = (erro: string) => resultados.push({ transacao_id: id, ok: false, erro });
    if (!t) { falhar("Lançamento não encontrado."); continue; }
    if (t.tipo !== "Receita" || t.status !== "Pendente") { falhar("Só conta a receber em aberto pode ser cobrada."); continue; }
    if (!t.contato_id) { falhar("Vincule um cliente ao lançamento."); continue; }
    const pend = pendenciasDoCliente(t);
    if (pend.length) { falhar(`Complete o cadastro de ${t.nome}: ${pend.join(", ")}.`); continue; }
    const venc = String(t.venc).slice(0, 10);
    const valor = Number(t.valor);
    const idem = `khesef-${empresaId}-${id}-${valor.toFixed(2)}-${venc}`;
    const viva = ((await db.execute(sql`
      SELECT id FROM cobrancas WHERE transacao_id = ${id} AND status IN ('aberta', 'processando', 'vencida') LIMIT 1
    `)) as any[])[0];
    if (viva) { falhar("Já existe cobrança em aberto para este lançamento."); continue; }

    try {
      const payload = montarPayloadCobranca(
        { id, descricao: t.descricao, valor, vencimento: venc },
        t,
        { multa_pct: integ.multa_pct, juros_mes_pct: integ.juros_mes_pct, desconto_pct: o.desconto_pct, formas: o.formas },
      );
      const resp = await emitirCobranca(cred, payload, idem);
      const dados = dadosDePagamento(resp);
      const ins = ((await db.execute(sql`
        INSERT INTO cobrancas (empresa_id, provedor, provedor_id, transacao_id, contato_id, status, valor, vencimento,
                               linha_digitavel, codigo_barras, pix_copia_cola, url_pdf, idempotency_key, payload)
        VALUES (${empresaId}, ${PROVEDOR}, ${String(resp?.id || "") || null}, ${id}, ${t.contato_id}, ${mapearStatus(resp?.status)}, ${valor.toFixed(2)}, ${venc},
                ${dados.linha_digitavel}, ${dados.codigo_barras}, ${dados.pix_copia_cola}, ${dados.url_pdf}, ${idem}, ${JSON.stringify(resp ?? {})}::jsonb)
        RETURNING id
      `)) as any[])[0];
      // O dinheiro vai cair no Cora: o título passa a apontar para essa conta.
      await db.execute(sql`UPDATE empresas_transacoes SET conta_bancaria_id = ${integ.conta_bancaria_id} WHERE id = ${id} AND empresa_id = ${empresaId}`);
      resultados.push({ transacao_id: id, ok: true, cobranca_id: Number(ins.id) });
    } catch (e: any) {
      falhar(e instanceof ErroCora ? e.message : "Falha ao emitir no Cora.");
    }
  }
  return { emitidas: resultados.filter((r) => r.ok).length, resultados };
}

/** Nova cobrança avulsa: cria a conta a receber e já emite no Cora. */
export async function novaCobranca(empresaId: number, b: any) {
  // Confere o cliente antes de criar a conta a receber: nada fica pela metade.
  const contatoId = Number(b.contato_id);
  if (!Number.isInteger(contatoId) || contatoId <= 0) throw new ErroErp("Escolha o cliente.");
  const cli = ((await db.execute(sql`SELECT * FROM empresas_contatos WHERE id = ${contatoId} AND empresa_id = ${empresaId}`)) as any[])[0];
  if (!cli) throw new ErroErp("Cliente não encontrado.");
  const pend = pendenciasDoCliente(cli);
  if (pend.length) throw new ErroErp(`Complete o cadastro de ${cli.nome}: ${pend.join(", ")}.`);
  const { integ } = await credenciais(empresaId);
  if (integ.status !== "conectada") throw new ErroErp("A conexão com o Cora não está ativa. Teste a conexão antes de emitir.", 409);
  const { criados } = await criarTitulo(empresaId, "Receita", { ...b, parcelas: b.parcelas || 1 });
  const r = await emitirParaTitulos(empresaId, criados.map((c: any) => c.id), { desconto_pct: b.desconto_pct });
  return { ...r, titulos: criados };
}

export async function listarCobrancas(empresaId: number, f: { status?: string; de?: string; ate?: string; contato_id?: number | null; q?: string }) {
  const iso = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const st = String(f.status || "");
  const termo = String(f.q || "").trim().slice(0, 80);
  const linhas = (await db.execute(sql`
    SELECT cb.*, c.nome AS contato_nome, c.email AS contato_email, t.descricao
    FROM cobrancas cb
    LEFT JOIN empresas_contatos c ON c.id = cb.contato_id
    LEFT JOIN empresas_transacoes t ON t.id = cb.transacao_id
    WHERE cb.empresa_id = ${empresaId}
      AND (${st} = '' OR cb.status = ${st} OR (${st} = 'aberta' AND cb.status IN ('aberta', 'processando')))
      AND (${iso(f.de)}::date IS NULL OR cb.vencimento >= ${iso(f.de)}::date)
      AND (${iso(f.ate)}::date IS NULL OR cb.vencimento <= ${iso(f.ate)}::date)
      AND (${f.contato_id ?? null}::int IS NULL OR cb.contato_id = ${f.contato_id ?? null})
      AND (${termo} = '' OR c.nome ILIKE ${"%" + termo + "%"} OR t.descricao ILIKE ${"%" + termo + "%"})
    ORDER BY cb.vencimento DESC, cb.id DESC
    LIMIT 1000
  `)) as any[];
  const resumo = { emitido: 0, recebido: 0, em_aberto: 0, vencido: 0 };
  for (const l of linhas) {
    if (l.status === "cancelada") continue;
    resumo.emitido += Number(l.valor);
    if (l.status === "paga") resumo.recebido += Number(l.valor_pago ?? l.valor);
    else if (l.status === "vencida") resumo.vencido += Number(l.valor);
    else resumo.em_aberto += Number(l.valor);
  }
  for (const k of Object.keys(resumo) as (keyof typeof resumo)[]) resumo[k] = r2(resumo[k]);
  return { linhas: linhas.map(({ payload, ...l }) => l), resumo };
}

async function cobrancaDaEmpresa(empresaId: number, id: number) {
  const c = ((await db.execute(sql`SELECT * FROM cobrancas WHERE id = ${id} AND empresa_id = ${empresaId}`)) as any[])[0];
  if (!c) throw new ErroErp("Cobrança não encontrada.", 404);
  return c;
}

/**
 * Consulta a cobrança no Cora e aplica o resultado: paga → baixa a conta a
 * receber no banco Cora, na data do pagamento (diferença vira juros/desconto);
 * cancelada/vencida → só atualiza. Idempotente: chamar de novo não baixa duas vezes.
 */
export async function sincronizarCobranca(empresaId: number, cobrancaId: number) {
  const cb = await cobrancaDaEmpresa(empresaId, cobrancaId);
  if (!cb.provedor_id) return { status: cb.status, mudou: false };
  const { cred, integ } = await credenciais(empresaId);
  const resp = await consultarCobranca(cred, cb.provedor_id);
  const status = mapearStatus(resp?.status);
  const pg = dadosDoPagamento(resp);
  const dados = dadosDePagamento(resp);
  let baixou = false;

  if (status === "paga" && cb.transacao_id) {
    const t = ((await db.execute(sql`SELECT status FROM empresas_transacoes WHERE id = ${cb.transacao_id} AND empresa_id = ${empresaId}`)) as any[])[0];
    if (t?.status === "Pendente") {
      await baixarTitulos(empresaId, [{ id: cb.transacao_id, valor_pago: pg.valor_pago ?? undefined }], {
        data_pagamento: pg.pago_em ?? undefined,
        conta_bancaria_id: integ.conta_bancaria_id,
      });
      baixou = true;
    }
  }
  await db.execute(sql`
    UPDATE cobrancas SET status = ${status}, valor_pago = ${pg.valor_pago}, pago_em = ${pg.pago_em},
      linha_digitavel = COALESCE(${dados.linha_digitavel}, linha_digitavel), pix_copia_cola = COALESCE(${dados.pix_copia_cola}, pix_copia_cola),
      url_pdf = COALESCE(${dados.url_pdf}, url_pdf), atualizado_em = now()
    WHERE id = ${cobrancaId}
  `);
  if (baixou) await avisarPagamento(empresaId, cb, pg.valor_pago ?? Number(cb.valor));
  return { status, mudou: status !== cb.status, baixou };
}

export async function cancelar(empresaId: number, cobrancaId: number) {
  const cb = await cobrancaDaEmpresa(empresaId, cobrancaId);
  if (!["aberta", "vencida"].includes(cb.status)) throw new ErroErp("Só dá para cancelar cobrança em aberto.");
  const { cred } = await credenciais(empresaId);
  if (cb.provedor_id) await cancelarCobranca(cred, cb.provedor_id);
  await db.execute(sql`UPDATE cobrancas SET status = 'cancelada', atualizado_em = now() WHERE id = ${cobrancaId}`);
  // A conta a receber continua em aberto (pode ser recebida por outro meio).
  return { cancelada: true };
}

export async function enviarPorEmail(empresaId: number, cobrancaId: number) {
  const cb = await cobrancaDaEmpresa(empresaId, cobrancaId);
  const c = ((await db.execute(sql`SELECT nome, email FROM empresas_contatos WHERE id = ${cb.contato_id}`)) as any[])[0];
  if (!c?.email) throw new ErroErp("O cliente não tem e-mail cadastrado.");
  const { isSmtpConfigured, createTransport, smtpFrom } = await import("../mailer");
  if (!isSmtpConfigured()) throw new ErroErp("O envio de e-mail não está configurado no servidor.", 503);
  const emp = ((await db.execute(sql`SELECT COALESCE(nome_fantasia, razao_social) AS nome FROM empresas WHERE id = ${empresaId}`)) as any[])[0];
  const valor = Number(cb.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const venc = String(cb.vencimento).slice(0, 10).split("-").reverse().join("/");
  const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
  const linhas = [
    `Olá, ${c.nome}.`,
    `${emp?.nome || "A empresa"} enviou uma cobrança de ${valor} com vencimento em ${venc}.`,
    cb.linha_digitavel ? `Linha digitável do boleto: ${cb.linha_digitavel}` : "",
    cb.pix_copia_cola ? `Pix copia e cola: ${cb.pix_copia_cola}` : "",
    cb.url_pdf ? `Boleto em PDF: ${cb.url_pdf}` : "",
  ].filter(Boolean);
  await createTransport().sendMail({
    from: smtpFrom(),
    to: c.email,
    subject: `Cobrança ${emp?.nome ? `de ${emp.nome} ` : ""}- vence em ${venc}`,
    text: linhas.join("\n\n"),
    html: linhas.map((l) => `<p>${esc(l)}</p>`).join(""),
  });
  return { enviado: true };
}

async function avisarPagamento(empresaId: number, cb: any, valor: number) {
  try {
    const emp = ((await db.execute(sql`SELECT usuario_id FROM empresas WHERE id = ${empresaId}`)) as any[])[0];
    const { broadcastNotification } = await import("../../websocket");
    broadcastNotification({
      id: `cora-${cb.id}-${Date.now()}`,
      type: "success",
      title: "Pagamento recebido no Cora",
      message: `${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} recebido e baixado em Contas a receber.`,
      timestamp: new Date().toISOString(),
      autoClose: 8000,
    } as any, [String(emp?.usuario_id)]);
  } catch { /* aviso é cortesia; a baixa já foi gravada */ }
}

// ----------------------------------------------------------------------------
// Webhook e sincronização periódica
// ----------------------------------------------------------------------------

/**
 * Evento do Cora. O token da URL identifica a empresa (guardado só como hash);
 * o id do evento evita processar duas vezes; o status vem da API, nunca do corpo.
 */
export async function processarWebhook(token: string, headers: Record<string, any>, corpo: any) {
  if (!token || token.length < 20) return { status: 404 as const };
  const integ = ((await db.execute(sql`
    SELECT empresa_id FROM empresas_integracoes WHERE provedor = ${PROVEDOR} AND webhook_token_hash = ${hashToken(token)}
  `)) as any[])[0];
  if (!integ) return { status: 404 as const };
  const empresaId = Number(integ.empresa_id);

  const recursoId = String(headers["webhook-resource-id"] || corpo?.resource?.id || corpo?.data?.id || corpo?.id || "").slice(0, 80);
  const eventoId = String(headers["webhook-event-id"] || corpo?.event_id || `${recursoId}:${headers["webhook-event-type"] || corpo?.type || ""}`).slice(0, 120);
  if (!recursoId) return { status: 200 as const, ignorado: "sem recurso" };

  const novo = ((await db.execute(sql`
    INSERT INTO integracoes_eventos (provedor, evento_id) VALUES (${PROVEDOR}, ${eventoId}) ON CONFLICT DO NOTHING RETURNING evento_id
  `)) as any[])[0];
  if (!novo) return { status: 200 as const, ignorado: "repetido" };

  const cb = ((await db.execute(sql`
    SELECT id FROM cobrancas WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR} AND provedor_id = ${recursoId}
  `)) as any[])[0];
  if (!cb) return { status: 200 as const, ignorado: "cobrança desconhecida" };
  try {
    return { status: 200 as const, resultado: await sincronizarCobranca(empresaId, Number(cb.id)) };
  } catch (e) {
    // Libera o evento para o Cora reenviar (e o job ainda cobre).
    await db.execute(sql`DELETE FROM integracoes_eventos WHERE provedor = ${PROVEDOR} AND evento_id = ${eventoId}`);
    throw e;
  }
}

/** Rede de segurança do webhook: revisa cobranças em aberto dos últimos 120 dias. */
export async function sincronizarTudo(): Promise<{ empresas: number; revisadas: number; baixadas: number; falhas: number }> {
  const integs = (await db.execute(sql`SELECT empresa_id FROM empresas_integracoes WHERE provedor = ${PROVEDOR} AND status = 'conectada'`)) as any[];
  let revisadas = 0, baixadas = 0, falhas = 0;
  for (const i of integs) {
    const empresaId = Number(i.empresa_id);
    const abertas = (await db.execute(sql`
      SELECT id FROM cobrancas
      WHERE empresa_id = ${empresaId} AND status IN ('aberta', 'processando', 'vencida') AND vencimento >= CURRENT_DATE - 120
      ORDER BY vencimento LIMIT 300
    `)) as any[];
    for (const c of abertas) {
      try {
        const r = await sincronizarCobranca(empresaId, Number(c.id));
        revisadas++;
        if (r.baixou) baixadas++;
      } catch {
        falhas++;
      }
    }
    await db.execute(sql`UPDATE empresas_integracoes SET ultimo_sync_em = now() WHERE empresa_id = ${empresaId} AND provedor = ${PROVEDOR}`);
  }
  return { empresas: integs.length, revisadas, baixadas, falhas };
}

