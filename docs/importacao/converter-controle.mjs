/**
 * Converte o controle PF colado (texto bruto) em CSV/XLSX para /importar.
 * Uso: node docs/importacao/converter-controle.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brutoPath = path.join(__dirname, "controle-bruto.txt");
const outCsv = path.join(__dirname, "lancamentos-pf-importacao.csv");
const outXlsx = path.join(__dirname, "lancamentos-pf-importacao.xlsx");

const FORMAS_GENERICAS =
  /^(boleto|d[ée]bito|cart[aã]o de d[ée]bito|cart[aã]o de cr[ée]dito|cart[aã]o|pix|dinheiro|transfer[êe]ncia|ted|doc|esp[ée]cie)$/i;
const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const RE_VALOR = /[−\-]\s*R\$\s*[\d.]+,\d{2}|R\$\s*[\d.]+,\d{2}/i;

function norm(s) {
  return (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseValor(s) {
  const m = String(s).match(/([−\-]?\s*R\$\s*[\d.]+,\d{2})/i);
  if (!m) return null;
  let t = m[1].trim();
  const neg = /[−\-]/.test(t.replace(/r\$/i, "")) || true; // despesas do controle
  t = t.replace(/[^\d.,]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  return -Math.abs(n); // sempre negativo no arquivo de importação
}

function isForma(s) {
  const t = String(s || "").trim();
  if (!t || t === "—") return false;
  if (FORMAS_GENERICAS.test(t)) return true;
  if (/^CC\b/i.test(t)) return true;
  if (/Venc\.?\s*\d{1,2}/i.test(t)) return true;
  return false;
}

function isCategoria(s) {
  const t = String(s || "").trim();
  if (!t || t === "—") return true; // "—" vira Outros
  if (/^\d+(\.\d+)?\s*-/.test(t)) return true;
  if (/^(Empr[eé]stimo Loja|Despesa Pai)$/i.test(t)) return true;
  return false;
}

function splitCamposLinha(line) {
  // Preferência: TAB; senão tenta fatiar por valor R$
  if (line.includes("\t")) {
    return line.split("\t").map((x) => x.trim()).filter((x) => x !== "");
  }
  const vm = line.match(RE_VALOR);
  if (!vm) return [line.trim()];
  const idx = line.indexOf(vm[0]);
  const antes = line.slice(0, idx).trim();
  const depois = line.slice(idx + vm[0].length).trim();
  const partesAntes = antes.split(/\s{2,}|\t/).map((x) => x.trim()).filter(Boolean);
  // fallback: se só um bloco, tentar "categoria + forma" no fim
  if (partesAntes.length === 1) {
    const tokens = partesAntes[0].split(/\s+/);
    // última forma costuma começar com CC / Boleto / PIX / Débito
    for (let i = tokens.length - 1; i >= 0; i--) {
      const cand = tokens.slice(i).join(" ");
      if (isForma(cand)) {
        const cat = tokens.slice(0, i).join(" ").trim() || "—";
        return [cat, cand, vm[0], depois || "Em aberto"].filter(Boolean);
      }
    }
  }
  return [...partesAntes, vm[0], ...(depois ? [depois] : [])];
}

function parseBruto(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const registros = [];
  let i = 0;

  // pula cabeçalho se houver
  while (i < lines.length && !RE_DATA.test(lines[i].trim())) i++;

  while (i < lines.length) {
    const dataLine = lines[i].trim();
    if (!RE_DATA.test(dataLine)) { i++; continue; }
    const data = dataLine;
    i++;

    const descParts = [];
    let camposLine = null;

    while (i < lines.length) {
      const raw = lines[i];
      const t = raw.trim();
      if (RE_DATA.test(t)) break; // próximo registro
      i++;
      if (!t) continue;
      if (t === "Reservar") continue;
      if (RE_VALOR.test(t) || t.includes("\t") && /Em aberto|Pago/i.test(t)) {
        camposLine = raw;
        // pode haver "Reservar" depois
        while (i < lines.length && !RE_DATA.test(lines[i].trim()) && !lines[i].trim()) i++;
        if (i < lines.length && lines[i].trim() === "Reservar") i++;
        break;
      }
      // linha com tabs misturando tag + categoria + forma + valor
      if (raw.includes("\t") && RE_VALOR.test(raw)) {
        camposLine = raw;
        break;
      }
      descParts.push(t);
    }

    if (!camposLine) continue;
    const campos = splitCamposLinha(camposLine);
    // Esperado: [tag?] categoria forma valor [status]
    let tag = null;
    let categoria = "—";
    let forma = "";
    let valorStr = null;
    let status = "Em aberto";

    const valorIdx = campos.findIndex((c) => RE_VALOR.test(c));
    if (valorIdx < 0) continue;
    valorStr = campos[valorIdx];
    if (campos[valorIdx + 1]) status = campos[valorIdx + 1];

    const antes = campos.slice(0, valorIdx);
    if (antes.length === 0) {
      // só valor
    } else if (antes.length === 1) {
      if (isForma(antes[0])) forma = antes[0];
      else categoria = antes[0];
    } else if (antes.length === 2) {
      categoria = antes[0];
      forma = antes[1];
    } else {
      // tag + categoria + forma (ou tag multi)
      // Se o penúltimo parece categoria e o último forma:
      forma = antes[antes.length - 1];
      categoria = antes[antes.length - 2];
      tag = antes.slice(0, -2).join(" · ");
    }

    // Se categoria parece tag (Nescon...) e forma parece categoria, rearranja
    if (categoria && !isCategoria(categoria) && isCategoria(forma)) {
      tag = [tag, categoria].filter(Boolean).join(" · ");
      categoria = forma;
      forma = "";
    }
    // Se "forma" na verdade é categoria e não há forma
    if (forma && isCategoria(forma) && !isForma(forma) && isForma(categoria)) {
      const tmp = categoria; categoria = forma; forma = tmp;
    }

    if (tag) descParts.push(tag);

    const valor = parseValor(valorStr);
    if (valor == null) continue;

    const descricao = descParts.filter(Boolean).join("\n");
    registros.push({
      Data: data,
      Descrição: descricao,
      Categoria: !categoria || categoria === "—" ? "—" : categoria,
      Forma: forma || "—",
      Valor: valorStr.match(RE_VALOR)[0].replace(/\s+/g, " ").trim().replace(/^-/, "−").replace(/^−\s*/, "− "),
      Status: status.includes("aberto") || status.includes("Aberto") ? "Em aberto" : status,
    });
  }

  // normaliza valor com sinal unicode
  for (const r of registros) {
    const n = parseValor(r.Valor);
    r.Valor = `− R$ ${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return registros;
}

function main() {
  if (!fs.existsSync(brutoPath)) {
    console.error("Arquivo não encontrado:", brutoPath);
    process.exit(1);
  }
  const text = fs.readFileSync(brutoPath, "utf8");
  const rows = parseBruto(text);
  console.log(`Registros parseados: ${rows.length}`);

  // CSV (datas como texto; descrição com aspas e quebras)
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [
    ["Data", "Descrição", "Categoria", "Forma", "Valor", "Status"].join(","),
    ...rows.map((r) => [r.Data, r.Descrição, r.Categoria, r.Forma, r.Valor, r.Status].map(esc).join(",")),
  ].join("\n");
  fs.writeFileSync(outCsv, "\uFEFF" + csv, "utf8");

  // XLSX
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
    Data: r.Data,
    Descrição: r.Descrição,
    Categoria: r.Categoria,
    Forma: r.Forma,
    Valor: r.Valor,
    Status: r.Status,
  })), { cellDates: false });
  // força coluna Data como texto
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = 1; R <= range.e.r; R++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: 0 });
    if (ws[addr]) { ws[addr].t = "s"; ws[addr].z = "@"; }
  }
  XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
  XLSX.writeFile(wb, outXlsx);

  // resumo
  const formas = new Set(rows.map((r) => r.Forma).filter((f) => f && f !== "—"));
  const cats = new Set(rows.map((r) => r.Categoria).filter((c) => c && c !== "—"));
  const reemb = rows.filter((r) => /reembolso\s+pendente|nescon|igreja/i.test(r.Descrição)).length;
  console.log(`Formas distintas: ${formas.size}`);
  console.log([...formas].sort().join(" | "));
  console.log(`Categorias distintas: ${cats.size}`);
  console.log(`Prováveis reembolsáveis (tag): ${reemb}`);
  console.log("CSV:", outCsv);
  console.log("XLSX:", outXlsx);
}

main();
