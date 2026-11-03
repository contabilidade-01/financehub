/**
 * Fila de provedores de IA: ordem, castigo por tipo de falha, candidatos e
 * limpeza de mensagens para provedores compatíveis com OpenAI.
 */
import { minutosFora, ordemEfetiva, candidatos, limparMensagens, ORDEM_PADRAO, montarCorpo, semCercaJson, configProvedor } from "../server/services/ia-provedores";

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
igual("padrão", ordemEfetiva([...ORDEM_PADRAO]), ["openai", "deepseek", "gemini", "groq", "anthropic"]);
igual("orquestrador prefere DeepSeek", ordemEfetiva([...ORDEM_PADRAO], "deepseek"), ["deepseek", "openai", "gemini", "groq", "anthropic"]);
igual("ordem salva incompleta é completada", ordemEfetiva(["gemini", "openai"] as any), ["gemini", "openai", "deepseek", "groq", "anthropic"]);
igual("ignora repetidos e desconhecidos", ordemEfetiva(["deepseek", "x", "deepseek"] as any), ["deepseek", "openai", "gemini", "groq", "anthropic"]);

console.log("Candidatos");
const agora = 1_000_000;
const base = { configurado: (p: string) => p !== "groq" && p !== "anthropic", desligado: () => false, foraAte: () => 0 };
igual("todos saudáveis (groq e claude sem chave ficam de fora)", candidatos([...ORDEM_PADRAO], base, agora), ["openai", "deepseek", "gemini"]);
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

console.log("Claude (API compatível com OpenAI)");
{
  const env0 = { ...process.env };
  delete process.env.ANTHROPIC_MODEL; delete process.env.ANTHROPIC_OPENAI_BASE_URL;
  process.env.ANTHROPIC_API_KEY = "x";
  const c = configProvedor("anthropic");
  igual("config padrão", [c.nome, c.modelo, c.baseUrl, c.configurado], ["Claude", "claude-haiku-5-5", "https://api.anthropic.com/v1", true]);
  process.env = env0;
}
const msgs = [{ role: "user", content: "oi" }];
const ferramentas = [{ type: "function", function: { name: "f", parameters: { type: "object", properties: {} } } }];
const cl = montarCorpo("anthropic", "claude-haiku-5-5", { messages: msgs, temperature: 0, response_format: { type: "json_object" } });
igual("Claude: sem temperature e sem json_object; com max_tokens", [cl.temperature, cl.response_format, cl.max_tokens], [undefined, undefined, 4096]);
const cs = montarCorpo("anthropic", "claude-haiku-5-5", { messages: msgs, response_format: { type: "json_schema", json_schema: { strict: true } } });
igual("Claude: json_schema passa", cs.response_format?.type, "json_schema");
igual("Claude Sonnet 5.5: tool_choice forçado vira auto", montarCorpo("anthropic", "claude-sonnet-5-5", { messages: msgs, tools: ferramentas, tool_choice: "required" }).tool_choice, "auto");
igual("Claude Haiku 5.5: tool_choice required mantido", montarCorpo("anthropic", "claude-haiku-5-5", { messages: msgs, tools: ferramentas, tool_choice: "required" }).tool_choice, "required");
const op = montarCorpo("openai", "gpt-4o-mini", { messages: msgs, temperature: 0, response_format: { type: "json_object" } });
igual("OpenAI segue igual (temperature e json_object)", [op.temperature, op.response_format?.type, op.max_tokens], [0, "json_object", undefined]);
igual("padrão de temperature 0.1 nos outros", montarCorpo("deepseek", "deepseek-chat", { messages: msgs }).temperature, 0.1);
igual("tira cerca ```json", semCercaJson('```json\n{"a":1}\n```'), '{"a":1}');
igual("sem cerca fica igual", semCercaJson('{"a":1}'), '{"a":1}');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log("\nOK");
