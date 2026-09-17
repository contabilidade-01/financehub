"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Backup do banco — partes puras (literais SQL e escolha do horário).
 * Um literal mal escapado corrompe o dump inteiro em silêncio: é o que estes
 * testes protegem.
 */
const backup_service_1 = require("../server/services/backup.service");
let falhas = 0;
const ok = (n) => console.log("ok  ", n);
const fail = (n, d) => { falhas++; console.error("FAIL", n, "—", d); };
const eq = (nome, obtido, esperado) => obtido === esperado ? ok(nome) : fail(nome, `obtive ${obtido}, esperava ${esperado}`);
// --- Literais ---
eq("null vira NULL", (0, backup_service_1.literal)(null), "NULL");
eq("undefined vira NULL", (0, backup_service_1.literal)(undefined), "NULL");
eq("número inteiro", (0, backup_service_1.literal)(42), "42");
eq("número decimal", (0, backup_service_1.literal)(39.9), "39.9");
eq("NaN não quebra o dump", (0, backup_service_1.literal)(NaN), "NULL");
eq("booleano", (0, backup_service_1.literal)(true), "true");
eq("texto simples", (0, backup_service_1.literal)("Mercado"), "'Mercado'");
// Aspa simples é o caso clássico: sem dobrar, o INSERT quebra no meio.
eq("aspa simples dobrada", (0, backup_service_1.literal)("Fulano d'Água"), "'Fulano d''Água'");
eq("duas aspas seguidas", (0, backup_service_1.literal)("a''b"), "'a''''b'");
// standard_conforming_strings é o padrão: barra invertida é literal.
eq("barra invertida preservada", (0, backup_service_1.literal)("C:\\temp"), "'C:\\temp'");
// Quebra de linha dentro da descrição não pode virar comando solto.
eq("quebra de linha preservada", (0, backup_service_1.literal)("linha1\nlinha2"), "'linha1\nlinha2'");
{
    const d = (0, backup_service_1.literal)(new Date("2026-09-05T12:00:00.000Z"));
    eq("data em ISO", d, "'2026-09-05T12:00:00.000Z'");
}
eq("bytea em hex", (0, backup_service_1.literal)(Buffer.from([0x00, 0xff])), "'\\x00ff'::bytea");
eq("array", (0, backup_service_1.literal)([1, 2]), "ARRAY[1, 2]");
eq("array de texto escapa", (0, backup_service_1.literal)(["a'b"]), "ARRAY['a''b']");
eq("json vira jsonb", (0, backup_service_1.literal)({ a: 1 }), `'{"a":1}'::jsonb`);
eq("json com aspa escapa", (0, backup_service_1.literal)({ n: "d'Água" }), `'{"n":"d''Água"}'::jsonb`);
// --- Escolha do horário ---
eq("antes das 3h usa o slot de ontem", (0, backup_service_1.calcularSlot)("2026-09-05", 1), "2026-09-04T19");
eq("às 3h em ponto abre o slot da manhã", (0, backup_service_1.calcularSlot)("2026-09-05", 3), "2026-09-05T03");
eq("10h ainda é o slot das 3h", (0, backup_service_1.calcularSlot)("2026-09-05", 10), "2026-09-05T03");
eq("11h abre o slot do meio-dia", (0, backup_service_1.calcularSlot)("2026-09-05", 11), "2026-09-05T11");
eq("18h ainda é o slot das 11h", (0, backup_service_1.calcularSlot)("2026-09-05", 18), "2026-09-05T11");
eq("23h é o slot das 19h", (0, backup_service_1.calcularSlot)("2026-09-05", 23), "2026-09-05T19");
// Viradas de mês e de ano não podem gerar data inválida.
eq("virada de mês", (0, backup_service_1.calcularSlot)("2026-03-01", 0), "2026-02-28T19");
eq("virada de ano", (0, backup_service_1.calcularSlot)("2026-01-01", 2), "2025-12-31T19");
eq("ano bissexto", (0, backup_service_1.calcularSlot)("2028-03-01", 0), "2028-02-29T19");
// Um dia inteiro só pode produzir os 3 slots previstos, nunca mais.
{
    const slots = new Set(Array.from({ length: 24 }, (_, h) => (0, backup_service_1.calcularSlot)("2026-09-05", h)));
    if (slots.size !== backup_service_1.HORARIOS.length + 1) {
        fail("slots por dia", `obtive ${slots.size} distintos: ${[...slots].join(", ")}`);
    }
    else
        ok("as 24 horas caem em 3 slots do dia + o de ontem");
}
if (backup_service_1.HORARIOS.length !== 3)
    fail("3 horários por dia", String(backup_service_1.HORARIOS.length));
else
    ok("3 horários por dia");
if (backup_service_1.MAX_BACKUPS !== 20)
    fail("retenção de 20", String(backup_service_1.MAX_BACKUPS));
else
    ok("retenção de 20 cópias");
console.log(falhas ? `\n${falhas} falha(s)` : "\nBackup: OK");
process.exitCode = falhas ? 1 : 0;
