import { useLocation } from 'wouter';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/LocalizationContext';

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-primary">Erro 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {t('common.not_found_title', 'Página Não Encontrada')}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t('common.not_found_description', 'A página que você está procurando não existe ou foi movida.')}
        </p>
        <Button onClick={() => setLocation('/')} className="mt-6">
          <Home className="h-4 w-4" />
          {t('common.go_home', 'Voltar ao Início')}
        </Button>
      </div>
    </div>
  );
}
