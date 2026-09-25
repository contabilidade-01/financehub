import { Link } from "wouter";
import { ImportacaoExtrato } from "@/components/importacao/ImportacaoExtrato";
import { FLAG_IMPORTACAO_EXTRATO_V2, useFlag } from "@/hooks/use-flag";

/** Importação de extrato bancário — pessoa física. PJ usa /p/importar-extrato. */
export default function ImportarExtratoPage({ escopo = "pf", empresaId }: { escopo?: "pf" | "pj"; empresaId?: number | null }) {
  const { ativa, carregando } = useFlag(FLAG_IMPORTACAO_EXTRATO_V2);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar extrato</h1>
        <p className="text-sm text-muted-foreground">
          Traga o extrato do banco, classifique e concilie com o que já está lançado. Cada lançamento fica ligado à conta
          bancária.
        </p>
      </div>
      {carregando ? null : ativa ? (
        <ImportacaoExtrato escopo={escopo} empresaId={empresaId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          A nova importação de extrato ainda não está liberada para a sua conta. Use{" "}
          <Link href={escopo === "pj" ? "/p/conciliacao" : "/importar"} className="underline underline-offset-2">
            {escopo === "pj" ? "Conciliação bancária" : "Importar lançamentos"}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
