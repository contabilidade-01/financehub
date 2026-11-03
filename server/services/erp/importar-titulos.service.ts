/**
 * Importação de contas a pagar / a receber a partir de QUALQUER planilha
 * (CSV ou Excel): o cliente diz o que é cada coluna (mapeamento), vê a prévia
 * e confirma. Clientes/fornecedores e contas do plano que não existem podem
 * ser criados na hora.
 *
 * Leitura e mapeamento são funções puras (testadas em scripts/testar-importacao-titulos.ts);
 * só `importarTitulos` toca o banco.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { hojeSP } from "../nlp-br";
import { dataDeCelula, decodificarTexto, lerCsv, lerPlanilha, valorDeCelula } from "../importacao/parsers";
import { ErroErp, criarContaPlano, criarContato } from "./erp.service";
import { dinheiro, type TipoTitulo } from "./titulos.service";

export type CampoTitulo =
  | "descricao" | "valor" | "data_vencimento" | "contato" | "categoria"
  | "data_competencia" | "data_pagamento" | "documento" | "centro_custo";

export interface DefinicaoCampo {
  chave: CampoTitulo;
  rotulo: string;
  obrigatorio: boolean;
  descricao: string;
  aliases: string[];
}

/** O que o sistema precisa (e aceita) de uma planilha de títulos. Rótulos mudam entre receber e pagar. */
export function camposTitulo(tipo: TipoTitulo): DefinicaoCampo[] {
  const pessoa = tipo === "Receita" ? "Cliente" : "Fornecedor";
  const feito = tipo === "Receita" ? "recebimento" : "pagamento";
  return [
    { chave: "descricao", rotulo: "Descrição", obrigatorio: true, descricao: "Do que se trata (ex.: Honorários 11/2026, NF 1234).",
      aliases: ["descricao", "historico", "titulo", "lancamento", "item", "servico", "produto", "referente", "referencia", "observacao", "obs", "detalhe", "memo", "description"] },
    { chave: "valor", rotulo: "Valor", obrigatorio: true, descricao: "Valor do título. Aceita 1.234,56, 1234.56, R$ 10,00.",
      aliases: ["valor", "valor total", "valor (r$)", "valor r$", "total", "montante", "quantia", "amount", "valor do titulo", "valor da parcela", "valor liquido", "valor bruto"] },
    { chave: "data_vencimento", rotulo: tipo === "Receita" ? "Data de recebimento prevista (vencimento)" : "Data de vencimento", obrigatorio: true,
      descricao: "Quando vence. Aceita dd/mm/aaaa, aaaa-mm-dd, dd/mm/aa.",
      aliases: ["vencimento", "data de vencimento", "data vencimento", "dt vencimento", "dt venc", "venc", "data prevista", "previsao", "data de recebimento prevista", "data", "due date"] },
    { chave: "contato", rotulo: pessoa, obrigatorio: false, descricao: `Nome do ${pessoa.toLowerCase()}. Quem não existe pode ser cadastrado na importação.`,
      aliases: tipo === "Receita"
        ? ["cliente", "nome do cliente", "sacado", "pagador", "devedor", "razao social", "nome", "contato", "empresa", "customer"]
        : ["fornecedor", "nome do fornecedor", "favorecido", "beneficiario", "credor", "cedente", "razao social", "nome", "contato", "empresa", "vendor", "supplier"] },
    { chave: "categoria", rotulo: tipo === "Receita" ? "Conta de receita (plano de contas)" : "Conta de despesa (plano de contas)", obrigatorio: false,
      descricao: "Código ou nome da conta do plano. Sem coluna, usa a conta padrão escolhida abaixo.",
      aliases: ["categoria", "conta", "plano de contas", "conta do plano", "classificacao", "conta contabil", "natureza", "grupo", "tipo de despesa", "tipo de receita", "category"] },
    { chave: "data_competencia", rotulo: "Competência", obrigatorio: false, descricao: "Mês a que o título se refere (regime de competência). Sem coluna, usa o vencimento.",
      aliases: ["competencia", "data competencia", "data de competencia", "emissao", "data de emissao", "data emissao", "mes de referencia", "mes referencia", "referencia (mes)"] },
    { chave: "data_pagamento", rotulo: `Data do ${feito} (se já aconteceu)`, obrigatorio: false, descricao: `Linhas com data viram ${feito} realizado na conta bancária escolhida abaixo; sem data ficam em aberto.`,
      aliases: tipo === "Receita"
        ? ["data de recebimento", "data recebimento", "recebido em", "data do recebimento", "pago em", "data de pagamento", "data pagamento", "baixa", "data da baixa"]
        : ["data de pagamento", "data pagamento", "pago em", "data do pagamento", "baixa", "data da baixa", "quitado em"] },
    { chave: "documento", rotulo: "Documento / NF", obrigatorio: false, descricao: "Número da nota, boleto ou contrato. Vai junto da descrição.",
      aliases: ["documento", "n documento", "no documento", "numero documento", "nf", "nota", "nota fiscal", "numero da nf", "n nf", "boleto", "contrato", "doc", "numero", "codigo"] },
    { chave: "centro_custo", rotulo: "Centro de custo", obrigatorio: false, descricao: "Nome do centro de custo já cadastrado (opcional).",
      aliases: ["centro de custo", "centro custo", "centro de custos", "cc", "departamento", "setor", "projeto"] },
  ];
}

export type MapeamentoTitulos = Partial<Record<CampoTitulo, number>>;

const semAcento = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(/g, " (").replace(/[^a-z0-9/() $]/g, " ").replace(/\s+/g, " ").trim();

/** Lê CSV/Excel em linhas de texto e acha a linha de cabeçalho (até a 20ª). */
export function lerTabelaTitulos(buffer: Buffer, nome: string, tipo: TipoTitulo): { cabecalho: string[]; linhas: string[][]; linha_cabecalho: number } {
  const ehPlanilha = /\.(xlsx|xls|xlsm|ods)$/i.test(nome) || (buffer[0] === 0x50 && buffer[1] === 0x4b) || (buffer[0] === 0xd0 && buffer[1] === 0xcf);
  const bruto = ehPlanilha ? lerPlanilha(buffer) : lerCsv(decodificarTexto(buffer));
  const todas = bruto.filter((l) => l.some((c) => String(c).trim() !== ""));
  if (!todas.length) return { cabecalho: [], linhas: [], linha_cabecalho: -1 };
  const campos = camposTitulo(tipo);
  const casa = (celula: string) => campos.some((c) => c.aliases.some((a) => semAcento(celula) === a || semAcento(celula).startsWith(`${a} `)));
  let idx = -1;
  for (let i = 0; i < Math.min(20, todas.length); i++) {
    const l = todas[i];
    const casados = l.filter((c) => casa(c)).length;
    // Cabeçalho: ≥2 colunas com nome conhecido e nenhuma célula que seja só número/data.
    if (casados >= 2 && !l.some((c) => valorDeCelula(c) != null && String(c).length > 0 && !/[a-z]/i.test(c))) { idx = i; break; }
  }
  if (idx < 0) {
    // Sem nomes conhecidos: a primeira linha só de texto é o cabeçalho; senão colunas genéricas.
    const i0 = todas.findIndex((l) => l.filter((c) => String(c).trim()).every((c) => valorDeCelula(c) == null && !dataDeCelula(c)));
    if (i0 === 0) idx = 0;
  }
  const cabecalho = idx >= 0 ? todas[idx].map((c, i) => String(c).trim() || `Coluna ${i + 1}`) : todas[0].map((_, i) => `Coluna ${i + 1}`);
  const linhas = todas.slice(idx >= 0 ? idx + 1 : 0);
  return { cabecalho, linhas, linha_cabecalho: idx };
}

/** Sugere o mapeamento pelos nomes das colunas e, no que faltar, pelo conteúdo. */
export function sugerirMapeamentoTitulos(cabecalho: string[], linhas: string[][], tipo: TipoTitulo): MapeamentoTitulos {
  const m: MapeamentoTitulos = {};
  const usadas = new Set<number>();
  const campos = camposTitulo(tipo);
  // Nomes: percorre os aliases em ordem de prioridade (o alias mais específico ganha a coluna).
  const ordem: CampoTitulo[] = ["valor", "data_vencimento", "data_pagamento", "data_competencia", "contato", "categoria", "centro_custo", "documento", "descricao"];
  for (const chave of ordem) {
    const def = campos.find((c) => c.chave === chave)!;
    // Nome exato vale mais que prefixo ("Data" não deve roubar a coluna "Data de pagamento").
    const achar = (teste: (c: string, a: string) => boolean) => {
      for (const a of def.aliases) {
        const i = cabecalho.findIndex((c, idx) => !usadas.has(idx) && teste(semAcento(c), a));
        if (i >= 0) return i;
      }
      return -1;
    };
    const i = (() => { const e = achar((c, a) => c === a); return e >= 0 ? e : achar((c, a) => c.startsWith(`${a} `) || c.startsWith(`${a}(`)); })();
    if (i >= 0) { m[chave] = i; usadas.add(i); }
  }
  const amostra = linhas.slice(0, 50);
  const ncol = Math.max(cabecalho.length, ...amostra.map((l) => l.length), 0);
  const taxa = (col: number, f: (s: string) => boolean) => {
    const vals = amostra.map((l) => l[col] ?? "").filter((v) => String(v).trim() !== "");
    return vals.length ? vals.filter(f).length / vals.length : 0;
  };
  if (m.data_vencimento === undefined) {
    for (let c = 0; c < ncol; c++) if (!usadas.has(c) && taxa(c, (v) => !!dataDeCelula(v)) > 0.5) { m.data_vencimento = c; usadas.add(c); break; }
  }
  if (m.valor === undefined) {
    for (let c = 0; c < ncol; c++) if (!usadas.has(c) && taxa(c, (v) => valorDeCelula(v) != null && !dataDeCelula(v)) > 0.5) { m.valor = c; usadas.add(c); break; }
  }
  if (m.descricao === undefined) {
    let melhor = -1, maior = 0;
    for (let c = 0; c < ncol; c++) {
      if (usadas.has(c)) continue;
      const media = amostra.reduce((s, l) => s + String(l[c] ?? "").length, 0) / Math.max(1, amostra.length);
      if (taxa(c, (v) => valorDeCelula(v) == null && !dataDeCelula(v)) > 0.6 && media > maior) { maior = media; melhor = c; }
    }
    if (melhor >= 0) m.descricao = melhor;
  }
  return m;
}

export interface ItemTitulo {
  linha: number;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_competencia: string | null;
  data_pagamento: string | null;
  contato: string | null;
  categoria: string | null;
  documento: string | null;
  centro_custo: string | null;
}
export interface ErroLinha { linha: number; motivo: string; conteudo: string }

const iso = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

/** Aplica o mapeamento: cada linha vira um título ou um erro explicado. Totais/rodapés são ignorados. */
export function aplicarMapeamentoTitulos(linhas: string[][], m: MapeamentoTitulos, primeiraLinha = 2): { itens: ItemTitulo[]; erros: ErroLinha[] } {
  const itens: ItemTitulo[] = [];
  const erros: ErroLinha[] = [];
  const col = (l: string[], k: CampoTitulo) => (m[k] !== undefined && m[k]! >= 0 ? String(l[m[k]!] ?? "").trim() : "");
  linhas.forEach((l, i) => {
    const n = primeiraLinha + i;
    if (!l.some((c) => String(c).trim())) return;
    const descBruta = col(l, "descricao");
    const doc = col(l, "documento") || null;
    const descricao = [descBruta, doc && !descBruta.includes(doc) ? `(${doc})` : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 240);
    const valor = valorDeCelula(col(l, "valor"));
    const venc = dataDeCelula(col(l, "data_vencimento"));
    if (/^(total|subtotal|saldo)\b/i.test(semAcento(descBruta)) && !venc) return; // rodapé
    if (!descricao) { erros.push({ linha: n, motivo: "Descrição vazia", conteudo: l.join(" | ").slice(0, 120) }); return; }
    if (valor == null || valor === 0) { erros.push({ linha: n, motivo: "Valor ilegível ou zero", conteudo: col(l, "valor") }); return; }
    if (!venc) { erros.push({ linha: n, motivo: "Data de vencimento inválida", conteudo: col(l, "data_vencimento") }); return; }
    const pag = col(l, "data_pagamento");
    const dataPag = pag ? dataDeCelula(pag) : null;
    if (pag && !dataPag && !/^(nao|não|n|pendente|aberto|em aberto|-|—)$/i.test(pag)) {
      erros.push({ linha: n, motivo: "Data de pagamento/recebimento inválida", conteudo: pag }); return;
    }
    itens.push({
      linha: n,
      descricao,
      valor: Math.abs(valor), // sinal não importa: o lado (pagar/receber) é a tela
      data_vencimento: venc,
      data_competencia: dataDeCelula(col(l, "data_competencia")) ?? null,
      data_pagamento: dataPag,
      contato: col(l, "contato").slice(0, 200) || null,
      categoria: col(l, "categoria").slice(0, 120) || null,
      documento: doc,
      centro_custo: col(l, "centro_custo").slice(0, 120) || null,
    });
  });
  return { itens, erros };
}

export interface OpcoesImportacao {
  simular?: boolean;
  criar_contatos?: boolean;
  criar_contas?: boolean;
  /** Conta do plano usada quando a linha não traz (ou não casa) uma conta. */
  categoria_padrao_id?: unknown;
  /** Conta bancária das linhas já pagas/recebidas. Sem ela, essas linhas ficam em aberto. */
  conta_bancaria_id?: unknown;
}

export interface ResultadoImportacao {
  simulacao: boolean;
  total: number;
  criados: number;
  pagos: number;
  pagos_sem_conta: number;
  duplicados: number;
  contatos_novos: string[];
  contas_novas: string[];
  sem_conta_do_plano: number;
  erros: ErroLinha[];
}

const normNome = (s: unknown) => semAcento(s).replace(/[^a-z0-9]/g, "");

/**
 * Grava (ou só simula) os títulos. Duplicado = mesmo tipo, vencimento, valor e
 * descrição já existentes na empresa. Tudo validado antes de gravar.
 */
export async function importarTitulos(empresaId: number, tipo: TipoTitulo, itensBrutos: unknown, o: OpcoesImportacao = {}): Promise<ResultadoImportacao> {
  if (!Array.isArray(itensBrutos) || !itensBrutos.length) throw new ErroErp("Nenhuma linha para importar.");
  if (itensBrutos.length > 3000) throw new ErroErp("No máximo 3.000 linhas por importação.");
  const simular = o.simular !== false && o.simular !== undefined ? !!o.simular : false;
  const erros: ErroLinha[] = [];
  const itens: ItemTitulo[] = [];
  (itensBrutos as any[]).forEach((b, i) => {
    const valor = dinheiro(b?.valor);
    const venc = iso(b?.data_vencimento);
    const descricao = String(b?.descricao ?? "").trim().slice(0, 240);
    const linha = Number(b?.linha) || i + 1;
    if (!descricao) return erros.push({ linha, motivo: "Descrição vazia", conteudo: "" });
    if (!(valor > 0) || valor > 99_999_999) return erros.push({ linha, motivo: "Valor inválido", conteudo: String(b?.valor ?? "") });
    if (!venc) return erros.push({ linha, motivo: "Vencimento inválido", conteudo: String(b?.data_vencimento ?? "") });
    itens.push({
      linha, descricao, valor, data_vencimento: venc,
      data_competencia: iso(b?.data_competencia), data_pagamento: iso(b?.data_pagamento),
      contato: String(b?.contato ?? "").trim().slice(0, 200) || null,
      categoria: String(b?.categoria ?? "").trim().slice(0, 120) || null,
      documento: String(b?.documento ?? "").trim().slice(0, 60) || null,
      centro_custo: String(b?.centro_custo ?? "").trim().slice(0, 120) || null,
    });
  });

  // Cadastros da empresa (uma leitura só).
  const contatos = (await db.execute(sql`SELECT id, nome, tipo FROM empresas_contatos WHERE empresa_id = ${empresaId} AND ativo = true`)) as any[];
  const contas = ((await storage.getEmpresasContasByEmpresaId(empresaId)) as any[]).filter((c) => c.tipo === tipo && c.sintetica !== true && c.ativo !== false);
  const centros = (await db.execute(sql`SELECT id, nome FROM empresas_centros_custo WHERE empresa_id = ${empresaId} AND ativo = true`)) as any[];
  const bancoId = o.conta_bancaria_id ? Number(o.conta_bancaria_id) : null;
  if (bancoId) {
    const ok = (await db.execute(sql`SELECT 1 FROM contas_bancarias WHERE id = ${bancoId} AND empresa_id = ${empresaId}`)) as any[];
    if (!ok.length) throw new ErroErp("Conta bancária inválida.");
  }
  let padraoId = o.categoria_padrao_id ? Number(o.categoria_padrao_id) : null;
  if (padraoId && !contas.some((c) => Number(c.id) === padraoId)) throw new ErroErp(`A conta padrão precisa ser uma conta analítica de ${tipo === "Receita" ? "receita" : "despesa"}.`);

  const porNomeContato = new Map(contatos.map((c) => [normNome(c.nome), Number(c.id)]));
  const porConta = new Map<string, number>();
  for (const c of contas) { porConta.set(normNome(c.codigo), Number(c.id)); porConta.set(normNome(c.nome), Number(c.id)); porConta.set(normNome(`${c.codigo} ${c.nome}`), Number(c.id)); }
  const porCentro = new Map(centros.map((c) => [normNome(c.nome), Number(c.id)]));

  // Duplicidade contra o que já existe.
  const existentes = (await db.execute(sql`
    SELECT COALESCE(data_vencimento, data_transacao)::text AS v, valor::numeric AS n, descricao FROM empresas_transacoes
    WHERE empresa_id = ${empresaId} AND tipo = ${tipo} AND cartao_id IS NULL AND fatura_id IS NULL
  `)) as any[];
  const chave = (v: string, n: number, d: string) => `${String(v).slice(0, 10)}|${Number(n).toFixed(2)}|${normNome(d)}`;
  const vistos = new Set(existentes.map((e) => chave(e.v, Number(e.n), e.descricao)));

  const contatosNovos = new Map<string, string>();
  const contasNovas = new Map<string, string>();
  let duplicados = 0, pagos = 0, pagosSemConta = 0, semContaPlano = 0;
  type Pronto = ItemTitulo & { contato_id: number | null; contato_novo: string | null; categoria_id: number | null; categoria_nova: string | null; centro_custo_id: number | null; efetivada: boolean };
  const prontos: Pronto[] = [];
  for (const it of itens) {
    const k = chave(it.data_vencimento, it.valor, it.descricao);
    if (vistos.has(k)) { duplicados++; continue; }
    vistos.add(k);
    let contatoId: number | null = null, contatoNovo: string | null = null;
    if (it.contato) {
      contatoId = porNomeContato.get(normNome(it.contato)) ?? null;
      if (!contatoId && o.criar_contatos !== false) { contatoNovo = it.contato; contatosNovos.set(normNome(it.contato), it.contato); }
    }
    let categoriaId: number | null = null, categoriaNova: string | null = null;
    if (it.categoria) {
      const m = it.categoria.match(/^(\d+(?:\.\d+)*)\s*[-–—:]?\s*(.*)$/);
      categoriaId = porConta.get(normNome(it.categoria)) ?? (m ? porConta.get(normNome(m[1])) ?? porConta.get(normNome(m[2])) : undefined) ?? null;
      if (!categoriaId && o.criar_contas) { categoriaNova = (m && m[2] ? m[2] : it.categoria).trim(); contasNovas.set(normNome(categoriaNova), categoriaNova); }
    }
    if (!categoriaId && !categoriaNova) {
      categoriaId = padraoId;
      if (!categoriaId) semContaPlano++;
    }
    const efetivada = !!it.data_pagamento && !!bancoId;
    if (it.data_pagamento) { if (bancoId) pagos++; else pagosSemConta++; }
    prontos.push({ ...it, contato_id: contatoId, contato_novo: contatoNovo, categoria_id: categoriaId, categoria_nova: categoriaNova, centro_custo_id: it.centro_custo ? porCentro.get(normNome(it.centro_custo)) ?? null : null, efetivada });
  }

  const resultado: ResultadoImportacao = {
    simulacao: simular, total: itens.length + erros.length, criados: prontos.length, pagos, pagos_sem_conta: pagosSemConta, duplicados,
    contatos_novos: [...contatosNovos.values()], contas_novas: [...contasNovas.values()], sem_conta_do_plano: semContaPlano, erros,
  };
  if (simular) return resultado;
  if (semContaPlano) throw new ErroErp(`${semContaPlano} linha(s) sem conta do plano: escolha a conta padrão ou marque "criar contas que não existem".`);
  if (!prontos.length) return resultado;

  // Cadastros novos antes dos títulos (fora da transação dos títulos: ficam criados mesmo se algo falhar depois).
  const tipoContato = tipo === "Receita" ? "cliente" : "fornecedor";
  for (const [k, nome] of contatosNovos) {
    const c = await criarContato(empresaId, { nome, tipo: tipoContato });
    porNomeContato.set(k, Number(c.id));
  }
  for (const [k, nome] of contasNovas) {
    const c = await criarContaPlano(empresaId, { nome, tipo });
    porConta.set(k, Number(c.id));
  }
  const hoje = hojeSP();
  await db.transaction(async (tx: any) => {
    for (const p of prontos) {
      const contatoId = p.contato_id ?? (p.contato_novo ? porNomeContato.get(normNome(p.contato_novo)) ?? null : null);
      const categoriaId = p.categoria_id ?? (p.categoria_nova ? porConta.get(normNome(p.categoria_nova)) ?? null : null);
      if (!categoriaId) throw new ErroErp(`Linha ${p.linha}: conta do plano não resolvida.`);
      await tx.execute(sql`
        INSERT INTO empresas_transacoes
          (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, data_vencimento, data_pagamento, status, origem,
           movimenta_caixa, conta_bancaria_id, contato_id, centro_custo_id)
        VALUES (${empresaId}, ${categoriaId}, ${p.descricao}, ${p.valor.toFixed(2)}, ${tipo}, ${p.data_competencia ?? p.data_vencimento}, ${p.data_vencimento},
                ${p.efetivada ? p.data_pagamento ?? hoje : null}, ${p.efetivada ? "Efetivada" : "Pendente"}, 'importacao',
                ${p.efetivada}, ${p.efetivada ? bancoId : null}, ${contatoId}, ${p.centro_custo_id})
      `);
    }
  });
  return resultado;
}
