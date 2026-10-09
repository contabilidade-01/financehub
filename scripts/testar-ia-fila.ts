/**
 * Fila de provedores de IA: ordem, castigo por tipo de falha, candidatos e
 * limpeza de mensagens para provedores compatíveis com OpenAI.
 */
import { minutosFora, ordemEfetiva, candidatos, limparMensagens, ORDEM_PADRAO } from "../server/services/ia-provedores";

let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}: obtido ${JSON.stringify(obtido)} esperado ${JSON.stringify(esperado)}`); }
}

console.log("Castigo por tipo de falha");
igual("sem crédito → 30 min", minutosFora("sem_credito"), 30);
igual("chave inválida → 30 min", minutosFora("auth"), 30);
igual("instável → 2 min", [minutosFora("transitorio"), minutosFora("rate_limit"), minutosFora("timeout")], [2, 2, 2]);
igual("bug (ex.: 400) → não tira da fila", minutosFora("bug"), 0);

console.log("Ordem");
igual("padrão", ordemEfetiva([...ORDEM_PADRAO]), ["openai", "deepseek", "gemini", "groq"]);
igual("orquestrador prefere DeepSeek", ordemEfetiva([...ORDEM_PADRAO], "deepseek"), ["deepseek", "openai", "gemini", "groq"]);
igual("ordem salva incompleta é completada", ordemEfetiva(["gemini", "openai"] as any), ["gemini", "openai", "deepseek", "groq"]);
igual("ignora repetidos e desconhecidos", ordemEfetiva(["deepseek", "x", "deepseek"] as any), ["deepseek", "openai", "gemini", "groq"]);

console.log("Candidatos");
const agora = 1_000_000;
const base = { configurado: (p: string) => p !== "groq", desligado: () => false, foraAte: () => 0 };
igual("todos saudáveis (groq sem chave fica de fora)", candidatos([...ORDEM_PADRAO], base, agora), ["openai", "deepseek", "gemini"]);
igual("OpenAI sem crédito → DeepSeek assume", candidatos([...ORDEM_PADRAO], { ...base, foraAte: (p) => (p === "openai" ? agora + 60_000 : 0) }, agora), ["deepseek", "gemini"]);
igual("castigo vencido → volta", candidatos([...ORDEM_PADRAO], { ...base, foraAte: (p) => (p === "openai" ? agora - 1 : 0) }, agora), ["openai", "deepseek", "gemini"]);
igual("desligado no admin não entra", candidatos([...ORDEM_PADRAO], { ...base, desligado: (p) => p === "deepseek" }, agora), ["openai", "gemini"]);
igual("todos fora → tenta todos mesmo assim", candidatos([...ORDEM_PADRAO], { ...base, foraAte: () => agora + 1 }, agora), ["openai", "deepseek", "gemini"]);
igual("nenhum configurado → vazio", candidatos([...ORDEM_PADRAO], { ...base, configurado: () => false }, agora), []);

console.log("Mensagens para DeepSeek/Gemini");
igual(
  "tira campos extras e troca content null por vazio",
  limparMensagens([
    { role: "assistant", content: null, refusal: null, annotations: [], tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "c1", content: "{}" },
  ]),
  [
    { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }] },
    { role: "tool", content: "{}", tool_call_id: "c1" },
  ],
);

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log("\nOK");
