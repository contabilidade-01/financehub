/**
 * Gera as variantes do logo a partir da arte original.
 *
 * A arte de origem é um símbolo de 88x88 perdido numa tela transparente de
 * 800x200: disco preto com monograma branco. Daqui saem duas variantes por
 * tema, porque o preto some no fundo escuro da barra lateral:
 *   - light: arte original (disco preto)
 *   - dark:  luminância invertida (disco branco)
 *
 * Uso: node docs/marca/gerar-logos.mjs
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ORIGEM = "docs/marca/nescon-original.png";
const SAIDA = "docs/marca/preview";
fs.mkdirSync(SAIDA, { recursive: true });

/** Recorta a arte real, descartando a margem transparente/branca. */
async function recortar(arquivo) {
  const { data, info } = await sharp(arquivo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a > 16 && !(r > 245 && g > 245 && b > 245)) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return sharp(arquivo).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
}

/**
 * Amplia e reendurece as bordas. A arte só tem preto e branco puros, então
 * limiarizar depois do redimensionamento devolve o contorno nítido que a
 * interpolação borrou.
 */
async function nitido(pipeline, lado) {
  const { data, info } = await pipeline
    .resize(lado, lado, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += info.channels) {
    const alpha = out[i + 3];
    if (alpha < 128) {
      out[i + 3] = 0;
      continue;
    }
    out[i + 3] = 255;
    const luma = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
    const v = luma > 127 ? 255 : 0;
    out[i] = out[i + 1] = out[i + 2] = v;
  }
  return { buffer: out, info };
}

/** Troca preto por branco mantendo o recorte do disco. */
function inverter({ buffer, info }) {
  const out = Buffer.from(buffer);
  for (let i = 0; i < out.length; i += info.channels) {
    if (out[i + 3] === 0) continue;
    out[i] = 255 - out[i];
    out[i + 1] = 255 - out[i + 1];
    out[i + 2] = 255 - out[i + 2];
  }
  return { buffer: out, info };
}

const paraPng = ({ buffer, info }) =>
  sharp(buffer, { raw: { width: info.width, height: info.height, channels: info.channels } }).png();

const LADO = 512;
const base = await nitido(await recortar(ORIGEM), LADO);
const claro = base;                 // disco preto  → fundo claro
const escuro = inverter(base);      // disco branco → fundo escuro

await paraPng(claro).toFile(path.join(SAIDA, "simbolo-light.png"));
await paraPng(escuro).toFile(path.join(SAIDA, "simbolo-dark.png"));

/**
 * Variante horizontal: símbolo + nome, na proporção larga que a barra lateral
 * reserva (230x60). O tipo é uma proposta — a fonte oficial da marca deve
 * substituir isto se existir.
 */
async function horizontal(simbolo, corTexto, destino) {
  const A = 200;                       // altura da arte
  const simb = await paraPng(simbolo).resize(A, A).toBuffer();
  const largura = 760;
  const texto = Buffer.from(
    `<svg width="${largura}" height="${A}" xmlns="http://www.w3.org/2000/svg">
       <text x="${A + 40}" y="${A / 2}" dominant-baseline="central"
             font-family="Segoe UI, Arial, sans-serif" font-size="120"
             font-weight="700" letter-spacing="6" fill="${corTexto}">NESCON</text>
     </svg>`,
  );
  await sharp({ create: { width: largura, height: A, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: simb, top: 0, left: 0 }, { input: texto, top: 0, left: 0 }])
    .png()
    .toFile(destino);
}

await horizontal(claro, "#000000", path.join(SAIDA, "horizontal-light.png"));
await horizontal(escuro, "#ffffff", path.join(SAIDA, "horizontal-dark.png"));

/** Mock-up da caixa real do menu (230x60) sobre o fundo de cada tema. */
async function mock(arquivo, fundo, destino) {
  const arte = await sharp(arquivo).resize(230, 60, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const m = await sharp(arte).metadata();
  await sharp({ create: { width: 280, height: 100, channels: 4, background: fundo } })
    .composite([{ input: arte, top: Math.round((100 - m.height) / 2), left: 25 }])
    .png()
    .toFile(destino);
}

const FUNDO_ESCURO = { r: 12, g: 16, b: 28, alpha: 1 };
const FUNDO_CLARO = { r: 255, g: 255, b: 255, alpha: 1 };
await mock(path.join(SAIDA, "simbolo-light.png"), FUNDO_CLARO, path.join(SAIDA, "mock-simbolo-light.png"));
await mock(path.join(SAIDA, "simbolo-dark.png"), FUNDO_ESCURO, path.join(SAIDA, "mock-simbolo-dark.png"));
await mock(path.join(SAIDA, "horizontal-light.png"), FUNDO_CLARO, path.join(SAIDA, "mock-horizontal-light.png"));
await mock(path.join(SAIDA, "horizontal-dark.png"), FUNDO_ESCURO, path.join(SAIDA, "mock-horizontal-dark.png"));

for (const f of fs.readdirSync(SAIDA)) {
  const m = await sharp(path.join(SAIDA, f)).metadata();
  console.log(`${f.padEnd(28)} ${m.width}x${m.height}`);
}
