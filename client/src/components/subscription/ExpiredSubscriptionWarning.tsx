import { Lock, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ExpiredSubscriptionWarningProps {
  expirationDate?: string;
  className?: string;
}

export function ExpiredSubscriptionWarning({ expirationDate, className = "" }: ExpiredSubscriptionWarningProps) {
  return (
    <Alert className={`border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 ${className}`}>
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-expense" />
        <AlertTriangle className="h-4 w-4 text-expense" />
      </div>
      <AlertDescription className="text-expense font-medium">
        <div className="space-y-1">
          <p>Assinatura Expirada - Acesso Restrito</p>
          {expirationDate && (
            <p className="text-sm">
              Expirou em: {new Date(expirationDate).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}