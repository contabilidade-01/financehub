/**
 * Variantes de telefone para casar o número do WhatsApp (chatid) com o
 * telefone gravado no cadastro (admin ou site). O banco guarda DDD+número
 * sem o 55, mas registros antigos podem ter o 55; e o WhatsApp às vezes
 * entrega celulares sem o nono dígito (ex.: 555193219036 vs 51993219036).
 */
export function variantesTelefone(chatidOuTelefone: string): string[] {
  let d = String(chatidOuTelefone || "").split("@")[0].replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return [];

  const base = new Set<string>([d]);
  // Celular sem o nono dígito (DDD + 8 dígitos começando em 6-9) → com o 9
  if (d.length === 10 && /[6-9]/.test(d[2])) base.add(d.slice(0, 2) + "9" + d.slice(2));
  // Celular com o nono dígito → sem o 9
  if (d.length === 11 && d[2] === "9") base.add(d.slice(0, 2) + d.slice(3));

  const todas = new Set<string>();
  base.forEach((v) => {
    todas.add(v);
    todas.add("55" + v);
  });
  return Array.from(todas);
}
