"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const RESET = "\x1b[0m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
function parsePgUrl(url) {
    const match = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
    if (!match)
        return {};
    return {
        user: match[1],
        password: match[2],
        host: match[3],
        port: match[4] || "5432",
        database: match[5]
    };
}
async function prompt(question) {
    process.stdout.write(question);
    return await new Promise((resolve) => {
        process.stdin.resume();
        process.stdin.setEncoding("utf-8");
        process.stdin.once("data", (data) => {
            process.stdin.pause();
            resolve(data.toString().trim());
        });
    });
}
async function main() {
    const srcUrl = process.env.DATABASE_URL_MIGRATION;
    const dstUrl = process.env.DATABASE_URL;
    if (!srcUrl || !dstUrl) {
        console.error(RED + "Defina DATABASE_URL_MIGRATION e DATABASE_URL no .env" + RESET);
        process.exit(1);
    }
    const src = parsePgUrl(srcUrl);
    const dst = parsePgUrl(dstUrl);
    console.log("\n==============================");
    console.log(CYAN + "MIGRAÇÃO DE BANCO DE DADOS" + RESET);
    console.log("==============================");
    console.log("\nBanco de ORIGEM:");
    console.log(YELLOW + `  Host:     ${src.host}` + RESET);
    console.log(YELLOW + `  Database: ${src.database}` + RESET);
    console.log(YELLOW + `  Usuário:  ${src.user}` + RESET);
    console.log("\nBanco de DESTINO:");
    console.log(GREEN + `  Host:     ${dst.host}` + RESET);
    console.log(GREEN + `  Database: ${dst.database}` + RESET);
    console.log(GREEN + `  Usuário:  ${dst.user}` + RESET);
    console.log("\n" + RED + "ATENÇÃO: Todo o conteúdo do banco de ORIGEM será copiado para o DESTINO!" + RESET);
    console.log(RED + "Isso pode sobrescrever dados existentes no destino." + RESET);
    const answer = await prompt("\nDeseja realmente continuar? (s/N) ");
    if (answer.toLowerCase() !== "s") {
        console.log("Operação cancelada.");
        process.exit(0);
    }
    // Perguntar se deseja zerar o banco de destino
    const answerDrop = await prompt(GREEN + "\nDeseja ZERAR o banco de DESTINO antes de migrar? (s/N) " + RESET);
    const dropAll = answerDrop.trim().toLowerCase() === "s";
    if (dropAll) {
        console.log(RED + "\nO banco de destino será ZERADO antes da migração!" + RESET);
        // Aqui entraria a lógica de drop das tabelas do destino
    }
    else {
        console.log(GREEN + "\nO banco de destino será mantido, apenas dados serão copiados." + RESET);
    }
    // Aqui segue a lógica de migração (conexão, exportação, importação...)
    console.log("\n[Preparando para migrar dados...]");
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
    main().catch((err) => {
        console.error(RED + "Erro na migração:" + RESET, err);
        process.exit(1);
    });
}
