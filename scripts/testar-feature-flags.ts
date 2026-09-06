/**
 * Feature flags — avaliação pura (sem banco).
 * npm run test:feature-flags
 */
import { avaliarFlag } from "../server/services/feature-flags-logic";

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d: string) => {
  falhas++;
  console.error("FAIL", n, "—", d);
};

// Flag inexistente = false
if (avaliarFlag({ existe: false, ativoTodos: false, usuariosComFlag: [], usuarioId: 1 })) {
  fail("inexistente", "deveria ser false");
} else ok("inexistente → false");

// Ligada só para A
{
  const a = avaliarFlag({
    existe: true,
    ativoTodos: false,
    usuariosComFlag: [10],
    usuarioId: 10,
  });
  const b = avaliarFlag({
    existe: true,
    ativoTodos: false,
    usuariosComFlag: [10],
    usuarioId: 20,
  });
  if (!a) fail("só A", "A deveria ver");
  else if (b) fail("só A", "B não deveria ver");
  else ok("ligada só para A");
}

// ativo_todos
if (
  !avaliarFlag({
    existe: true,
    ativoTodos: true,
    usuariosComFlag: [],
    usuarioId: 99,
  })
) {
  fail("todos", "qualquer um deveria ver");
} else ok("ativo_todos → qualquer usuário");

// Desligar (lista vazia + não todos)
if (
  avaliarFlag({
    existe: true,
    ativoTodos: false,
    usuariosComFlag: [],
    usuarioId: 10,
  })
) {
  fail("desligada", "deveria ser false");
} else ok("desligada → false");

// Sem usuário
if (
  avaliarFlag({
    existe: true,
    ativoTodos: false,
    usuariosComFlag: [1],
    usuarioId: null,
  })
) {
  fail("anon", "anon sem ativo_todos = false");
} else ok("sem usuarioId → false (se não for todos)");

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nFeature flags: OK");
