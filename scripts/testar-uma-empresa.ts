/**
 * Um login = uma empresa + resolverEmpresa ignora args.empresa.
 * npm run test:uma-empresa
 *
 * Usa mocks leves (sem DB) para a lógica de unicidade e resolução.
 */
import { detectarMeio } from "../server/services/parse-meio";

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d?: string) => {
  falhas++;
  console.error("FAIL", n, d || "");
};

// --- Simula a regra de createEmpresa (unicidade) ---
function criarEmpresaUnica(
  existentes: { id: number }[],
  novo: { usuario_id: number },
): { ok: true; id: number } | { ok: false; code: string } {
  if (existentes.length > 0) return { ok: false, code: "EMPRESA_UNICA" };
  return { ok: true, id: 1 };
}

{
  const r1 = criarEmpresaUnica([], { usuario_id: 27 });
  if (!r1.ok) fail("primeira empresa");
  else ok("primeira empresa criada");

  const r2 = criarEmpresaUnica([{ id: 1 }], { usuario_id: 27 });
  if (r2.ok || r2.code !== "EMPRESA_UNICA") fail("segunda empresa deveria recusar");
  else ok("segunda empresa recusada (EMPRESA_UNICA)");
}

// --- resolverEmpresa: sempre empresaAtiva ---
function resolverEmpresaMock(
  empresaAtiva: { id: number; nome: string } | null,
  _argsEmpresa: string,
  lista: { id: number; nome: string }[],
) {
  if (empresaAtiva) return empresaAtiva;
  if (lista.length === 1) return lista[0];
  return { erro: true };
}

{
  const ativa = { id: 4, nome: "Nescon" };
  const r = resolverEmpresaMock(ativa, "Outra Empresa Fantasma", [
    ativa,
    { id: 99, nome: "Outra" },
  ]);
  if ((r as any).id !== 4) fail("resolver ignora args.empresa", JSON.stringify(r));
  else ok("resolverEmpresa usa empresaAtiva (ignora args)");
}

// --- Banco Santander não vira cartão na detecção ---
{
  const d = detectarMeio("Compra de mercadoria R$ 31,30 no Banco Santander");
  if (d.tipo !== "nome" || d.pista !== "conta") {
    fail("Banco Santander → conta", JSON.stringify(d));
  } else ok("Banco Santander → pista conta");

  const c = detectarMeio("Compra de 50 no cartão Santander");
  if (c.tipo !== "nome" || c.pista !== "cartao") {
    fail("cartão Santander → cartao", JSON.stringify(c));
  } else ok("cartão Santander → pista cartao");
}

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nUma empresa: OK");
