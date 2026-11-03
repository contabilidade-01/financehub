// Grava video.html quadro a quadro e monta o MP4 com ffmpeg.
// Uso: node gravar.mjs [--versao geral] [--previa t1,t2,...]
// Se existir narracao-<versao>.mp3 nesta pasta, ela entra como áudio do MP4.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const iPrev = args.indexOf("--previa");
const previa = iPrev >= 0 ? args[iPrev + 1].split(",").map(Number) : null;
const iVer = args.indexOf("--versao");
const versao = iVer >= 0 ? args[iVer + 1] : "cristao";
const nome = versao === "geral" ? "video-tudo-contado" : "video-financas-cristas";
const iFmt = args.indexOf("--formato");
const formato = iFmt >= 0 ? args[iFmt + 1] : "quadrado";
const TAM = { quadrado: [1080, 1080], vertical: [1080, 1920], retrato: [1080, 1350] }[formato];
// O quadrado vai para o site; os outros formatos (redes sociais) vão para video/saidas/
const saida = formato === "quadrado" ? path.join(aqui, "../public/assets", nome + ".mp4") : path.join(aqui, "saidas", `${nome}-${formato}.mp4`);
mkdirSync(path.dirname(saida), { recursive: true });
const narracao = path.join(aqui, `narracao-${versao}.mp3`);
const arqTempos = path.join(aqui, `tempos-${versao}.json`);
const tempos = existsSync(arqTempos) ? JSON.parse(readFileSync(arqTempos, "utf8")) : null;
const FPS = 30;
const quadros = path.join(aqui, `.quadros-${versao}-${formato}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: TAM[0], height: TAM[1] } });
await page.goto("file://" + path.join(aqui, "video.html") + `?v=${versao}&f=${formato}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
// Estica cada cena para caber a narração (tempos-<versao>.json, de montar_audio.py)
if (tempos) await page.evaluate(({ orig: O, novo: N }) => {
  const base = window.render;
  window.render = t => {
    let i = 0;
    while (i < N.length - 2 && t >= N[i + 1]) i++;
    base(O[i] + (t - N[i]) * (O[i + 1] - O[i]) / (N[i + 1] - N[i]));
  };
  window.__TOTAL = N[N.length - 1];
}, tempos);

if (previa) {
  for (const t of previa) {
    await page.evaluate(t => render(t), t);
    await page.screenshot({ path: path.join(aqui, `.previa-${versao}-${formato}-${t}.png`) });
  }
  await browser.close();
  process.exit(0);
}

rmSync(quadros, { recursive: true, force: true });
mkdirSync(quadros);
const total = await page.evaluate(() => window.__TOTAL ?? TOTAL);
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
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(quadros, String(Math.round((tempos ? tempos.capa : 38) * FPS)).padStart(5, "0") + ".jpg"),
  "-vf", `scale=720:${Math.round(720 * TAM[1] / TAM[0])}`, "-q:v", "4", saida.replace(/\.mp4$/, "-capa.jpg")], { stdio: "inherit" });
rmSync(quadros, { recursive: true, force: true });
console.log("ok", saida);
