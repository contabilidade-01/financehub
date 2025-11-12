import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, RefreshCw, ExternalLink, User, Mail, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/useWebSocket';
import { PaymentStatusBadge } from '@/components/billing/PaymentStatusBadge';

interface PaymentSearchResult {
  id: number;
  usuarioId: number;
  userName: string;
  userEmail: string;
  userPhone: string;
  subscriptionId: number | null;
  asaasPaymentId: string;
  asaasInvoiceUrl: string | null;
  amount: string;
  currency: string;
  status: string;
  paymentMethod: string;
  dueDate: string;
  confirmedDate: string | null;
  description: string | null;
  retryCount: number;
  metadata: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export default function AdminPaymentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected } = useWebSocket(); // Real-time updates

  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [paymentMethod, setPaymentMethod] = useState<string>('all');
  const [processingPaymentId, setProcessingPaymentId] = useState<number | null>(null);

  // Fetch payments with search filters
  const { data: payments, isLoading, refetch } = useQuery<PaymentSearchResult[]>({
    queryKey: ['admin-payments-search', searchTerm, status, paymentMethod],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('q', searchTerm);
      if (status && status !== 'all') params.append('status', status);
      if (paymentMethod && paymentMethod !== 'all') params.append('paymentMethod', paymentMethod);
      params.append('limit', '100');

      const response = await fetch(`/api/admin/payments/search?${params.toString()}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch payments');
      return response.json();
    }
  });

  // Retry payment mutation
  const retryPaymentMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      const response = await fetch(`/api/admin/payments/${paymentId}/retry`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to retry payment');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? 'Sucesso' : 'Aviso',
        description: data.message,
        variant: data.success ? 'default' : 'destructive'
      });
      queryClient.invalidateQueries({ queryKey: ['admin-payments-search'] });
      queryClient.invalidateQueries({ queryKey: ['admin-billing'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao processar pagamento',
        description: error.message,
        variant: 'destructive'
      });
    },
    onSettled: () => {
      setProcessingPaymentId(null);
    }
  });

  const handleRetryPayment = (paymentId: number) => {
    setProcessingPaymentId(paymentId);
    retryPaymentMutation.mutate(paymentId);
  };

  const handleSearch = () => {
    refetch();
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Gerenciamento de Pagamentos</h1>
        <p className="text-muted-foreground mt-2">
          Busque e gerencie pagamentos de todos os usuários
        </p>
      </div>

      {/* Search Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros de Busca</CardTitle>
          <CardDescription>
            Busque por nome, email ou telefone do usuário
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search Input */}
            <div className="md:col-span-2">
              <Label htmlFor="search">Buscar Usuário</Label>
              <div className="flex gap-2">
                <Input
                  id="search"
                  placeholder="Nome, email ou telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} variant="default">
                  <Search className="h-4 w-4 mr-2" />
                  Buscar
                </Button>
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="overdue">Vencido</SelectItem>
                  <SelectItem value="refunded">Estornado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method Filter */}
            <div>
              <Label htmlFor="paymentMethod">Método</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os métodos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Resultados</CardTitle>
              <CardDescription>
                {payments ? `${payments.length} pagamento(s) encontrado(s)` : 'Carregando...'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isConnected && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Tempo real
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : payments && payments.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1 font-medium">
                            <User className="h-3 w-3" />
                            {payment.userName}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {payment.userEmail}
                          </div>
                          {payment.userPhone && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {payment.userPhone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={payment.status} />
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.paymentMethod.replace('_', ' ')}
                      </TableCell>
                      <TableCell>{formatDate(payment.dueDate)}</TableCell>
                      <TableCell>
                        <span className={payment.retryCount > 0 ? 'text-orange-600 font-medium' : ''}>
                          {payment.retryCount}/3
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {payment.asaasInvoiceUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(payment.asaasInvoiceUrl!, '_blank')}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                          {(payment.status === 'pending' || payment.status === 'overdue') && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleRetryPayment(payment.id)}
                              disabled={processingPaymentId === payment.id}
                            >
                              {processingPaymentId === payment.id ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Processando
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Processar
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum pagamento encontrado.</p>
              <p className="text-sm mt-2">Tente ajustar os filtros de busca.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
