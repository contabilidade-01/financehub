/**
 * Serviço de conciliação bancária.
 *
 * Determinístico: casamento por data+valor, dedup por FITID/hash, bater-saldo.
 * IA (só sugere): classificação de descrição bancária -> conta do plano de contas,
 * na ordem memória pessoal PJ -> memória global PJ -> modelo.
 */
import { createHash } from "crypto";
import axios from "axios";
import { parseOfx } from "../utils/ofx-parser";
import { withRetry } from "../utils/ai-errors";
import {
  storage,
  resolveMemoriaContaPJ,
  resolveMemoriaGlobal,
  hashExtratoJaImportado,
  criarImportacao,
  criarExtratoMovimento,
  buscarCandidatosConciliacao,
  conciliarMovimentoComTransacao,
} from "../storage";

interface SugestaoClassificacao {
  conta_id: number | null;
  origem: string | null;
  confianca: number | null;
}

// Sugere a conta contábil para uma descrição bancária. Só sugestão.
export async function sugerirClassificacao(
  userId: number,
  descricao: string,
  planoContas: { id: number; codigo: string; nome: string; tipo: string }[],
): Promise<SugestaoClassificacao> {
  // 1) memória pessoal PJ
  const pessoal = await resolveMemoriaContaPJ(userId, descricao);
  if (pessoal?.conta_contabil_id) {
    return { conta_id: pessoal.conta_contabil_id, origem: "memoria_pessoal", confianca: 92 };
  }
  // 2) memória global PJ (consenso agregado)
  const global = await resolveMemoriaGlobal("pj", descricao);
  if (global?.categoria_nome) {
    const c = planoContas.find((p) => p.nome.toLowerCase() === global.categoria_nome.toLowerCase());
    if (c) return { conta_id: c.id, origem: "memoria_global", confianca: 75 };
  }
  // 3) modelo (IA) — opcional e resiliente
  try {
    const ia = await classificarComIA(descricao, planoContas);
    if (ia) return { conta_id: ia, origem: "ia", confianca: 60 };
  } catch { /* sem IA disponível — segue sem sugestão */ }
  return { conta_id: null, origem: null, confianca: null };
}

async function classificarComIA(
  descricao: string,
  planoContas: { id: number; codigo: string; nome: string }[],
): Promise<number | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || planoContas.length === 0) return null;
  const lista = planoContas.map((c) => `${c.codigo} — ${c.nome}`).join("\n");
  const prompt = `Você é um contador. Classifique a descrição de um lançamento bancário em UMA conta do plano de contas abaixo. Responda SOMENTE com o código da conta (ex.: "3.1.1"), nada mais.\n\nPlano de contas:\n${lista}\n\nDescrição: "${descricao}"\nCódigo:`;
  const resp = await withRetry(
    () => axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: process.env.AI_MODEL || "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0 },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 },
    ),
    { provider: "openai-classificacao" },
  );
  const texto = (resp.data?.choices?.[0]?.message?.content || "").trim();
  const codigo = (texto.match(/[\d.]+/) || [])[0];
  if (!codigo) return null;
  const conta = planoContas.find((c) => c.codigo === codigo)
    || planoContas.find((c) => c.codigo.startsWith(codigo));
  return conta ? conta.id : null;
}

// Processa um extrato OFX: parse -> dedup -> movimentos -> casa/sugere.
export async function processarImportacaoOfx(params: {
  empresaId: number;
  contaBancariaId: number;
  usuarioId: number;
  arquivoNome: string;
  conteudo: string;
}): Promise<any> {
  const { empresaId, contaBancariaId, usuarioId, arquivoNome, conteudo } = params;
  const hash = createHash("sha256").update(conteudo).digest("hex");
  if (await hashExtratoJaImportado(contaBancariaId, hash)) {
    return { jaImportado: true, mensagem: "Este extrato já foi importado nesta conta." };
  }

  const extrato = parseOfx(conteudo);
  if (extrato.movimentos.length === 0) {
    return { erro: "Nenhum movimento encontrado no arquivo OFX." };
  }

  const importacao = await criarImportacao({
    empresa_id: empresaId, conta_bancaria_id: contaBancariaId, arquivo_nome: arquivoNome,
    formato: "ofx", periodo_de: extrato.periodoDe, periodo_ate: extrato.periodoAte,
    saldo_final_informado: extrato.saldoFinal != null ? extrato.saldoFinal.toFixed(2) : null,
    hash_arquivo: hash,
  });

  const planoContas = (await storage.getEmpresasContasByEmpresaId(empresaId)) as any[];
  let conciliados = 0, aClassificar = 0, duplicados = 0;

  for (const mov of extrato.movimentos) {
    // Casamento determinístico
    const candidatos = await buscarCandidatosConciliacao(empresaId, mov.valor, mov.data);
    let status = "pendente", transacaoId: number | null = null;
    let sug: SugestaoClassificacao = { conta_id: null, origem: null, confianca: null };

    if (candidatos.length === 1) {
      status = "conciliado";
      transacaoId = candidatos[0].id;
    } else {
      // Sem casamento claro -> sugerir classificação (IA/memória)
      sug = await sugerirClassificacao(usuarioId, mov.descricao, planoContas);
    }

    const criado = await criarExtratoMovimento({
      importacao_id: importacao.id, conta_bancaria_id: contaBancariaId, empresa_id: empresaId,
      fitid: mov.fitid, data: mov.data, valor: mov.valor, tipo: mov.tipo,
      descricao: mov.descricao, memo: mov.memo, status,
      transacao_id: transacaoId, sugestao_conta_id: sug.conta_id,
      sugestao_origem: sug.origem, sugestao_confianca: sug.confianca,
    });

    if (!criado) { duplicados++; continue; }
    if (status === "conciliado" && transacaoId) {
      await conciliarMovimentoComTransacao(criado.id, transacaoId);
      conciliados++;
    } else {
      aClassificar++;
    }
  }

  return {
    importacao_id: importacao.id,
    total: extrato.movimentos.length,
    conciliados, a_classificar: aClassificar, duplicados,
    saldo_final_informado: extrato.saldoFinal,
  };
}
