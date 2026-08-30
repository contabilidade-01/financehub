/**
 * Publica o símbolo gerado como logo do sistema e como favicon.
 *
 * Destinos:
 *   client/public  → fonte do build (vira dist/public, de onde /api/logo lê em produção)
 *   public         → de onde /api/logo lê em desenvolvimento
 *   dist/public    → build atual, só para não ficar desatualizado até o próximo build
 *
 * Uso: node docs/marca/aplicar-logos.mjs
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const PREVIEW = "docs/marca/preview";
const DESTINOS = ["client/public", "public", "dist/public"];
const LADO = 512;

const claro = path.join(PREVIEW, "simbolo-light.png");
const escuro = path.join(PREVIEW, "simbolo-dark.png");

for (const dir of DESTINOS) {
  if (!fs.existsSync(dir)) continue;
  await sharp(claro).resize(LADO, LADO).png({ compressionLevel: 9 }).toFile(path.join(dir, "logo-light.png"));
  await sharp(escuro).resize(LADO, LADO).png({ compressionLevel: 9 }).toFile(path.join(dir, "logo-dark.png"));
  console.log(`logo-light.png / logo-dark.png → ${dir}`);
}

// Favicon: o símbolo já traz o próprio fundo (disco), então cada variante é
// legível na aba correspondente ao esquema de cores do navegador.
const FAVICONS = [
  ["favicon-32.png", 32, claro],
  ["favicon-32-dark.png", 32, escuro],
  ["favicon-180.png", 180, claro],
  ["apple-touch-icon.png", 180, claro],
];
for (const [nome, lado, origem] of FAVICONS) {
  await sharp(origem).resize(lado, lado).png({ compressionLevel: 9 }).toFile(path.join("client/public", nome));
  console.log(`${nome} (${lado}px) → client/public`);
}

for (const dir of DESTINOS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of ["logo-light.png", "logo-dark.png"]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
      const m = await sharp(p).metadata();
      console.log(`  ${p}: ${m.width}x${m.height}, ${(fs.statSync(p).size / 1024).toFixed(1)} kB`);
    }
  }
}
