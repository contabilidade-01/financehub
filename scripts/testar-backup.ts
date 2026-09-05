/**
 * Backup do banco — partes puras (literais SQL e escolha do horário).
 * Um literal mal escapado corrompe o dump inteiro em silêncio: é o que estes
 * testes protegem.
 */
import { calcularSlot, literal, HORARIOS, MAX_BACKUPS } from "../server/services/backup.service";

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d: string) => { falhas++; console.error("FAIL", n, "—", d); };
const eq = (nome: string, obtido: string, esperado: string) =>
  obtido === esperado ? ok(nome) : fail(nome, `obtive ${obtido}, esperava ${esperado}`);

// --- Literais ---
eq("null vira NULL", literal(null), "NULL");
eq("undefined vira NULL", literal(undefined), "NULL");
eq("número inteiro", literal(42), "42");
eq("número decimal", literal(39.9), "39.9");
eq("NaN não quebra o dump", literal(NaN), "NULL");
eq("booleano", literal(true), "true");
eq("texto simples", literal("Mercado"), "'Mercado'");

// Aspa simples é o caso clássico: sem dobrar, o INSERT quebra no meio.
eq("aspa simples dobrada", literal("Fulano d'Água"), "'Fulano d''Água'");
eq("duas aspas seguidas", literal("a''b"), "'a''''b'");

// standard_conforming_strings é o padrão: barra invertida é literal.
eq("barra invertida preservada", literal("C:\\temp"), "'C:\\temp'");

// Quebra de linha dentro da descrição não pode virar comando solto.
eq("quebra de linha preservada", literal("linha1\nlinha2"), "'linha1\nlinha2'");

{
  const d = literal(new Date("2026-09-05T12:00:00.000Z"));
  eq("data em ISO", d, "'2026-09-05T12:00:00.000Z'");
}
eq("bytea em hex", literal(Buffer.from([0x00, 0xff])), "'\\x00ff'::bytea");
eq("array", literal([1, 2]), "ARRAY[1, 2]");
eq("array de texto escapa", literal(["a'b"]), "ARRAY['a''b']");
eq("json vira jsonb", literal({ a: 1 }), `'{"a":1}'::jsonb`);
eq("json com aspa escapa", literal({ n: "d'Água" }), `'{"n":"d''Água"}'::jsonb`);

// --- Escolha do horário ---
eq("antes das 3h usa o slot de ontem", calcularSlot("2026-09-05", 1), "2026-09-04T19");
eq("às 3h em ponto abre o slot da manhã", calcularSlot("2026-09-05", 3), "2026-09-05T03");
eq("10h ainda é o slot das 3h", calcularSlot("2026-09-05", 10), "2026-09-05T03");
eq("11h abre o slot do meio-dia", calcularSlot("2026-09-05", 11), "2026-09-05T11");
eq("18h ainda é o slot das 11h", calcularSlot("2026-09-05", 18), "2026-09-05T11");
eq("23h é o slot das 19h", calcularSlot("2026-09-05", 23), "2026-09-05T19");

// Viradas de mês e de ano não podem gerar data inválida.
eq("virada de mês", calcularSlot("2026-03-01", 0), "2026-02-28T19");
eq("virada de ano", calcularSlot("2026-01-01", 2), "2025-12-31T19");
eq("ano bissexto", calcularSlot("2028-03-01", 0), "2028-02-29T19");

// Um dia inteiro só pode produzir os 3 slots previstos, nunca mais.
{
  const slots = new Set(Array.from({ length: 24 }, (_, h) => calcularSlot("2026-09-05", h)));
  if (slots.size !== HORARIOS.length + 1) {
    fail("slots por dia", `obtive ${slots.size} distintos: ${[...slots].join(", ")}`);
  } else ok("as 24 horas caem em 3 slots do dia + o de ontem");
}

if (HORARIOS.length !== 3) fail("3 horários por dia", String(HORARIOS.length));
else ok("3 horários por dia");
if (MAX_BACKUPS !== 20) fail("retenção de 20", String(MAX_BACKUPS));
else ok("retenção de 20 cópias");

console.log(falhas ? `\n${falhas} falha(s)` : "\nBackup: OK");
process.exitCode = falhas ? 1 : 0;
