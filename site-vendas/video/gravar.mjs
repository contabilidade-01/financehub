// Grava video.html quadro a quadro e monta o MP4 com ffmpeg.
// Uso: node gravar.mjs [--versao geral] [--previa t1,t2,...]
// Se existir narracao-<versao>.mp3 nesta pasta, ela entra como áudio do MP4.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const iPrev = args.indexOf("--previa");
const previa = iPrev >= 0 ? args[iPrev + 1].split(",").map(Number) : null;
const iVer = args.indexOf("--versao");
const versao = iVer >= 0 ? args[iVer + 1] : "cristao";
const nome = versao === "geral" ? "video-tudo-contado" : "video-financas-cristas";
const saida = path.join(aqui, "../public/assets", nome + ".mp4");
const narracao = path.join(aqui, `narracao-${versao}.mp3`);
const FPS = 30;
const quadros = path.join(aqui, ".quadros");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
await page.goto("file://" + path.join(aqui, "video.html") + (versao === "geral" ? "?v=geral" : ""));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

if (previa) {
  for (const t of previa) {
    await page.evaluate(t => render(t), t);
    await page.screenshot({ path: path.join(aqui, `.previa-${versao}-${t}.png`) });
  }
  await browser.close();
  process.exit(0);
}

rmSync(quadros, { recursive: true, force: true });
mkdirSync(quadros);
const total = await page.evaluate(() => TOTAL);
const n = Math.round(total * FPS);
for (let f = 0; f < n; f++) {
  await page.evaluate(t => render(t), f / FPS);
  await page.screenshot({ path: path.join(quadros, String(f).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 92 });
}
await browser.close();

const temAudio = existsSync(narracao);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(quadros, "%05d.jpg"),
  ...(temAudio ? ["-i", narracao, "-c:a", "aac", "-b:a", "128k", "-af", "apad", "-shortest"] : []),
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "slow", "-movflags", "+faststart", saida], { stdio: "inherit" });
// Capa (poster) a partir do quadro do resumo
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(quadros, String(Math.round(38 * FPS)).padStart(5, "0") + ".jpg"),
  "-vf", "scale=720:720", "-q:v", "4", saida.replace(/\.mp4$/, "-capa.jpg")], { stdio: "inherit" });
rmSync(quadros, { recursive: true, force: true });
console.log("ok", saida);
