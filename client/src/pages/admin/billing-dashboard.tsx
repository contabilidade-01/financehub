import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Edit, Trash2, DollarSign, Users, CreditCard, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/useWebSocket';
import { PaymentStatusBadge } from '@/components/billing/PaymentStatusBadge';
import { motion } from 'framer-motion';

interface SubscriptionPlan {
  id: number;
  planCode: string;
  name: string;
  priceMonthly: string;
  features: string;
  active: boolean;
}

interface UserSubscription {
  id: number;
  usuarioId: number;
  userName: string;
  userEmail: string;
  planName: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
}

interface BillingMetrics {
  totalActiveSubscriptions: number;
  totalRevenue: number;
  mrr: number;
  churnRate: number;
  recentPayments: {
    id: number;
    userName: string;
    amount: string;
    status: string;
    dueDate: string;
  }[];
}

interface WebhookLog {
  id: number;
  eventType: string;
  processed: boolean;
  createdAt: string;
}

export default function AdminBillingDashboard() {
  const { toast } = useToast();
  const { isConnected } = useWebSocket(); // Enable real-time updates via WebSocket
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showEditPlan, setShowEditPlan] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [togglingPlanId, setTogglingPlanId] = useState<number | null>(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [planToDeactivate, setPlanToDeactivate] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    planCode: '',
    name: '',
    priceMonthly: '',
    features: '',
    active: true
  });

  // Fetch metrics (real-time updates via WebSocket, no polling needed)
  const { data: metrics, isLoading: metricsLoading } = useQuery<BillingMetrics>({
    queryKey: ['admin-billing-metrics'],
    queryFn: async () => {
      const response = await fetch('/api/admin/billing/metrics', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch metrics');
      return response.json();
    }
  });

  // Fetch plans
  const { data: plans, isLoading: plansLoading, refetch: refetchPlans } = useQuery<SubscriptionPlan[]>({
    queryKey: ['admin-subscription-plans'],
    queryFn: async () => {
      const response = await fetch('/api/admin/subscription-plans', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch plans');
      return response.json();
    }
  });

  // Fetch subscriptions
  const { data: subscriptions, isLoading: subscriptionsLoading } = useQuery<UserSubscription[]>({
    queryKey: ['admin-subscriptions'],
    queryFn: async () => {
      const response = await fetch('/api/admin/subscriptions', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch subscriptions');
      return response.json();
    }
  });

  // Fetch webhook logs
  const { data: webhooksData, isLoading: webhooksLoading } = useQuery<{ total: number; webhooks: WebhookLog[] }>({
    queryKey: ['admin-webhooks'],
    queryFn: async () => {
      const response = await fetch('/api/admin/webhooks?limit=20', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch webhooks');
      return response.json();
    }
  });

  const webhooks = webhooksData?.webhooks || [];

  const handleCreatePlan = async () => {
    try {
      const response = await fetch('/api/admin/subscription-plans', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planForm)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create plan');
      }

      toast({ title: 'Plano criado com sucesso!' });
      setShowCreatePlan(false);
      setPlanForm({ planCode: '', name: '', priceMonthly: '', features: '', active: true });
      refetchPlans();
    } catch (error: any) {
      toast({
        title: 'Erro ao criar plano',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleUpdatePlan = async () => {
    if (!selectedPlan) return;

    try {
      const response = await fetch(`/api/admin/subscription-plans/${selectedPlan.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planForm)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update plan');
      }

      toast({ title: 'Plano atualizado com sucesso!' });
      setShowEditPlan(false);
      setSelectedPlan(null);
      refetchPlans();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar plano',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleTogglePlan = async (plan: SubscriptionPlan, newActiveState: boolean) => {
    // Se estiver desativando, mostrar confirmação
    if (!newActiveState) {
      setPlanToDeactivate(plan);
      setShowDeactivateConfirm(true);
      return;
    }

    // Se estiver ativando, fazer diretamente
    await performToggle(plan, newActiveState);
  };

  const performToggle = async (plan: SubscriptionPlan, newActiveState: boolean) => {
    setTogglingPlanId(plan.id);

    try {
      const response = await fetch(`/api/admin/subscription-plans/${plan.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newActiveState })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to toggle plan');
      }

      toast({
        title: newActiveState ? 'Plano ativado com sucesso!' : 'Plano desativado com sucesso!',
        description: `O plano "${plan.name}" agora está ${newActiveState ? 'ativo' : 'inativo'}.`
      });

      refetchPlans();
    } catch (error: any) {
      toast({
        title: 'Erro ao alterar status do plano',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setTogglingPlanId(null);
      setShowDeactivateConfirm(false);
      setPlanToDeactivate(null);
    }
  };

  const handleDeletePlan = async (planId: number) => {
    if (!confirm('Tem certeza que deseja excluir este plano?')) return;

    try {
      const response = await fetch(`/api/admin/subscription-plans/${planId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete plan');
      }

      toast({ title: 'Plano excluído com sucesso!' });
      refetchPlans();
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir plano',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const openEditDialog = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setPlanForm({
      planCode: plan.planCode,
      name: plan.name,
      priceMonthly: plan.priceMonthly,
      features: plan.features,
      active: plan.active
    });
    setShowEditPlan(true);
  };

  if (metricsLoading || plansLoading || subscriptionsLoading || webhooksLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard de Pagamentos</h1>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalActiveSubscriptions || 0}</div>
            <p className="text-xs text-muted-foreground">usuários ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {(metrics?.mrr || 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">receita recorrente mensal</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {(metrics?.totalRevenue || 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">total arrecadado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Churn</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics?.churnRate || 0).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">cancelamentos mensais</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Pagamentos Recentes</CardTitle>
          <CardDescription>Últimos 10 pagamentos processados</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vencimento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics?.recentPayments?.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{payment.userName}</TableCell>
                  <TableCell>R$ {parseFloat(payment.amount).toFixed(2)}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={payment.status} />
                  </TableCell>
                  <TableCell>
                    {new Date(payment.dueDate).toLocaleDateString('pt-BR')}
                  </TableCell>
                </TableRow>
              ))}
              {(!metrics?.recentPayments || metrics.recentPayments.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nenhum pagamento encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Subscription Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Planos de Assinatura</CardTitle>
              <CardDescription>Gerencie os planos disponíveis</CardDescription>
            </div>
            <Dialog open={showCreatePlan} onOpenChange={setShowCreatePlan}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Plano
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Plano</DialogTitle>
                  <DialogDescription>Preencha os dados do novo plano</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="planCode">Código do Plano</Label>
                    <Input
                      id="planCode"
                      value={planForm.planCode}
                      onChange={(e) => setPlanForm({ ...planForm, planCode: e.target.value })}
                      placeholder="ex: premium-monthly"
                    />
                  </div>
                  <div>
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      placeholder="ex: Plano Premium"
                    />
                  </div>
                  <div>
                    <Label htmlFor="price">Preço Mensal (R$)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={planForm.priceMonthly}
                      onChange={(e) => setPlanForm({ ...planForm, priceMonthly: e.target.value })}
                      placeholder="29.90"
                    />
                  </div>
                  <div>
                    <Label htmlFor="features">Recursos (JSON)</Label>
                    <Textarea
                      id="features"
                      value={planForm.features}
                      onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
                      placeholder='["Recurso 1", "Recurso 2"]'
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreatePlan(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreatePlan}>Criar Plano</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans?.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-mono text-sm">{plan.planCode}</TableCell>
                  <TableCell>{plan.name}</TableCell>
                  <TableCell>R$ {parseFloat(plan.priceMonthly).toFixed(2)}/mês</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={plan.active}
                        onCheckedChange={(checked) => handleTogglePlan(plan, checked)}
                        disabled={togglingPlanId === plan.id}
                      />
                      <motion.span
                        key={`${plan.id}-${plan.active}`}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          plan.active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {togglingPlanId === plan.id ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Alterando...
                          </span>
                        ) : (
                          plan.active ? 'Ativo' : 'Inativo'
                        )}
                      </motion.span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(plan)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePlan(plan.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Plan Dialog */}
      <Dialog open={showEditPlan} onOpenChange={setShowEditPlan}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Plano</DialogTitle>
            <DialogDescription>Atualize os dados do plano</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-planCode">Código do Plano</Label>
              <Input
                id="edit-planCode"
                value={planForm.planCode}
                onChange={(e) => setPlanForm({ ...planForm, planCode: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-price">Preço Mensal (R$)</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                value={planForm.priceMonthly}
                onChange={(e) => setPlanForm({ ...planForm, priceMonthly: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-features">Recursos (JSON)</Label>
              <Textarea
                id="edit-features"
                value={planForm.features}
                onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
                rows={4}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={planForm.active}
                onChange={(e) => setPlanForm({ ...planForm, active: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="edit-active">Plano Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPlan(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdatePlan}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle>Assinaturas Ativas</CardTitle>
          <CardDescription>Usuários com assinaturas ativas</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Próxima Renovação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions?.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell>{subscription.userName}</TableCell>
                  <TableCell>{subscription.userEmail}</TableCell>
                  <TableCell>{subscription.planName}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        subscription.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {subscription.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
                  </TableCell>
                </TableRow>
              ))}
              {(!subscriptions || subscriptions.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhuma assinatura ativa
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Webhook Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Logs de Webhooks</CardTitle>
          <CardDescription>Últimos 20 eventos recebidos do Asaas</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks?.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="font-mono text-sm">{webhook.eventType}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        webhook.processed
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {webhook.processed ? 'Processado' : 'Pendente'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {new Date(webhook.createdAt).toLocaleString('pt-BR')}
                  </TableCell>
                </TableRow>
              ))}
              {(!webhooks || webhooks.length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Nenhum webhook registrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Deactivation */}
      <AlertDialog open={showDeactivateConfirm} onOpenChange={setShowDeactivateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar Plano?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a desativar o plano <strong>"{planToDeactivate?.name}"</strong>.
              <br /><br />
              <span className="text-yellow-600 dark:text-yellow-400 font-semibold">⚠️ Atenção:</span> Este plano não ficará mais disponível para novas assinaturas, mas usuários com assinaturas ativas continuarão usando o plano até o final do período.
              <br /><br />
              Tem certeza que deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeactivateConfirm(false);
              setPlanToDeactivate(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => planToDeactivate && performToggle(planToDeactivate, false)}
              className="bg-red-600 hover:bg-red-700"
            >
              Sim, Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
