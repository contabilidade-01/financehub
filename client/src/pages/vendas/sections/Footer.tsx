export default function Footer({ nomeSistema }: { nomeSistema: string }) {
  const ano = new Date().getFullYear();

  return (
    <footer className="px-4 py-8 border-t">
      <div className="mx-auto max-w-5xl text-center text-xs text-muted-foreground">
        © {ano} {nomeSistema}. Todos os direitos reservados.
      </div>
    </footer>
  );
}
