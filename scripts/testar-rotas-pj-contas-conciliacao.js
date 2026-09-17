"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Smoke estático: Contas bancárias ≠ Conciliação (PJ).
 * Não precisa de DB — só confere roteamento/menu no código-fonte.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const root = process.cwd();
let falhas = 0;
const ok = (n) => console.log("ok  ", n);
const fail = (n, d) => {
    falhas++;
    console.error("FAIL", n, "—", d);
};
function read(rel) {
    return fs_1.default.readFileSync(path_1.default.join(root, rel), "utf8");
}
const sidebar = read("client/src/components/shared/Sidebar.tsx");
const router = read("client/src/pages/pj/PjRouter.tsx");
const conc = read("client/src/pages/pj/conciliacao/index.tsx");
const formas = read("client/src/pages/pj/formas-pagamento/index.tsx");
const contasPath = path_1.default.join(root, "client/src/pages/pj/contas-bancarias/index.tsx");
const oldPath = path_1.default.join(root, "client/src/pages/pj/conciliacao/ContasBancarias.tsx");
if (fs_1.default.existsSync(contasPath))
    ok("página contas-bancarias existe");
else
    fail("página contas-bancarias", "arquivo ausente");
if (!fs_1.default.existsSync(oldPath))
    ok("ContasBancarias saiu de conciliacao/");
else
    fail("move", "ainda existe conciliacao/ContasBancarias.tsx");
if (/text:\s*'Contas bancárias',\s*path:\s*"\/p\/contas-bancarias"/.test(sidebar)) {
    ok("menu Contas → /p/contas-bancarias");
}
else
    fail("menu Contas", "path errado ou ausente");
if (/text:\s*'Conciliação',\s*path:\s*"\/p\/conciliacao"/.test(sidebar)) {
    ok("menu Conciliação → /p/conciliacao");
}
else
    fail("menu Conciliação", "path errado ou ausente");
const pathsPj = [...sidebar.matchAll(/path:\s*"(\/p\/[^"]+)"/g)].map((m) => m[1]);
const contasPaths = pathsPj.filter((p) => p === "/p/contas-bancarias");
const concPaths = pathsPj.filter((p) => p === "/p/conciliacao");
if (contasPaths.length === 1 && concPaths.length === 1) {
    ok("menu PJ sem duplicar o mesmo endereço nos dois itens");
}
else {
    fail("menu duplicado", `contas=${contasPaths.length} conc=${concPaths.length}`);
}
if (/case\s+"contas-bancarias"/.test(router) && /PjContasBancarias/.test(router)) {
    ok("PjRouter tem case contas-bancarias");
}
else
    fail("PjRouter", "case/import ausente");
if (!/ContasBancarias/.test(conc) && /useState\("importar"\)/.test(conc) && /grid-cols-2/.test(conc)) {
    ok("Conciliação: 2 abas, inicia em importar, sem Contas");
}
else
    fail("Conciliação", "ainda tem Contas ou não inicia em importar");
if (/href="\/p\/contas-bancarias"/.test(formas))
    ok("formas-pagamento linka Contas");
else
    fail("formas-pagamento", "ainda aponta para /p/conciliacao");
if (/onIrParaBancada/.test(conc) && /onIrParaBancada/.test(read("client/src/pages/pj/conciliacao/Importar.tsx"))) {
    ok("Importar → Bancada via callback");
}
else
    fail("callback Bancada", "onIrParaBancada ausente");
if (falhas) {
    console.error(`\n${falhas} falha(s)`);
    process.exit(1);
}
console.log("\nRotas PJ Contas×Conciliação: OK");
