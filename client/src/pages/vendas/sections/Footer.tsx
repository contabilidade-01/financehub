import { Link } from "wouter";

export default function Footer({ nomeSistema }: { nomeSistema: string }) {
  const ano = new Date().getFullYear();

  return (
    <footer className="px-4 py-8 border-t">
      <div className="mx-auto max-w-5xl flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
        <nav className="flex gap-4" aria-label="Documentos legais">
          <Link href="/termos" className="hover:underline">Termos de Uso</Link>
          <Link href="/privacidade" className="hover:underline">Política de Privacidade</Link>
        </nav>
        <p>© {ano} {nomeSistema}. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
