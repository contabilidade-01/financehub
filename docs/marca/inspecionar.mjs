import sharp from "sharp";

const f = "docs/marca/nescon-original.png";
const m = await sharp(f).metadata();
console.log(`dimensões ${m.width}x${m.height} | canais ${m.channels} | alpha ${m.hasAlpha}`);

const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const at = (x, y) => {
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
};
const p = (x, y) => { const c = at(x, y); return `rgba(${c.r},${c.g},${c.b},${c.a})`; };

console.log("canto sup-esq:", p(0, 0));
console.log("centro:       ", p(Math.floor(info.width / 2), Math.floor(info.height / 2)));
console.log("canto inf-dir:", p(info.width - 1, info.height - 1));

// Caixa delimitadora do conteúdo (pixel não-transparente E não-branco).
let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const c = at(x, y);
    const visivel = c.a > 16 && !(c.r > 245 && c.g > 245 && c.b > 245);
    if (visivel) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
}
console.log(`conteúdo real: x ${x0}..${x1}, y ${y0}..${y1} => ${x1 - x0 + 1}x${y1 - y0 + 1}`);
