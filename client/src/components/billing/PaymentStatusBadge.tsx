import { Badge } from '@/components/ui/badge';

interface PaymentStatusBadgeProps {
  status: string;
}

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  const statusConfig = {
    confirmed: { label: 'Pago', variant: 'success' as const, className: 'bg-green-500' },
    pending: { label: 'Pendente', variant: 'secondary' as const, className: 'bg-yellow-500' },
    overdue: { label: 'Vencido', variant: 'destructive' as const, className: 'bg-red-500' },
    refunded: { label: 'Estornado', variant: 'outline' as const, className: 'bg-gray-500' },
    received_in_cash: { label: 'Recebido', variant: 'success' as const, className: 'bg-green-500' }
  };

  const config = statusConfig[status as keyof typeof statusConfig] || {
    label: status,
    variant: 'outline' as const,
    className: ''
  };

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
