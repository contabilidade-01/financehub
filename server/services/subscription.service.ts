/**
 * Subscription Service
 *
 * Serviço responsável pela lógica de negócio de assinaturas.
 * Orquestra a comunicação entre AsaasService e Storage.
 *
 * Princípios SOLID:
 * - Single Responsibility: Gerencia apenas lógica de assinaturas
 * - Dependency Injection: Recebe storage e asaasService como dependências
 */

import { getAsaasService, AsaasService, AsaasCreditCardData, AsaasCreditCardHolderInfo } from './asaas.service';
import { getNotificationService, NotificationService } from './notification.service';
import type { IStorage } from '../storage';
import { resolverPlanoDoUsuario } from './resolver-plano';
import { novaExpiracao, vencimentoPrimeiraCobranca, fimDoPeriodoPago } from './assinatura-datas';
import { rotuloModalidade } from '../../shared/modalidade';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import type {
  User,
  SubscriptionPlan,
  UserSubscription,
  PaymentTransaction,
  AsaasCustomer,
  SubscriptionStatus,
  PaymentStatus
} from "../../shared/schema";
import { generateRandomPassword } from '../utils/password-generator';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';

// Cache do nome do sistema para evitar queries repetidas
let cachedSystemName: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Busca o nome do sistema configurado em system_settings
 */
async function getSystemName(): Promise<string> {
  // Usar cache se ainda válido
  if (cachedSystemName && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return cachedSystemName;
  }

  try {
    const sql = postgres(process.env.DATABASE_URL || '', { prepare: false });
    const result = await sql`
      SELECT setting_value FROM system_settings WHERE setting_key = 'system_name' LIMIT 1
    `;
    await sql.end();

    if (result.length > 0 && result[0].setting_value) {
      cachedSystemName = result[0].setting_value;
      cacheTimestamp = Date.now();
      return cachedSystemName;
    }
  } catch (error) {
    console.warn('[SubscriptionService] Erro ao buscar system_name, usando padrão:', error);
  }

  return 'Khesef'; // Fallback
}

// ============================================
// INTERFACES
// ============================================

export interface CreateSubscriptionData {
  userId: number;
  planId: number;
  creditCard: AsaasCreditCardData;
  creditCardHolderInfo: AsaasCreditCardHolderInfo;
  cpfCnpj: string;
  remoteIp?: string;
  ciclo?: 'mensal' | 'trimestral' | 'anual'; // define o ciclo Asaas e o valor (× meses)
}

// Mapa ciclo → { cycle Asaas, meses } (preço = priceMonthly × meses)
export const CICLO_ASAAS: Record<string, { cycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'; meses: number }> = {
  mensal: { cycle: 'MONTHLY', meses: 1 },
  trimestral: { cycle: 'QUARTERLY', meses: 3 },
  anual: { cycle: 'YEARLY', meses: 12 },
};

function addMeses(base: Date, meses: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + meses);
  return d;
}

export interface SubscriptionWithPlan extends UserSubscription {
  plan: SubscriptionPlan;
}

export interface ActivateSubscriptionResult {
  subscription: UserSubscription;
  payment: PaymentTransaction;
  success: boolean;
  message: string;
}

// ============================================
// SUBSCRIPTION SERVICE CLASS
// ============================================

/**
 * Cobrança pendente pode ser reenviada ao cliente? Só se o valor for o do plano
 * atual, ainda não tiver vencido (vencimento >= hoje, calendário de SP) e não
 * estiver marcada como vencida pelo Asaas.
 */
export function podeReaproveitarCobranca(
  c: { valor: unknown; vencimento: unknown; status?: string },
  valorEsperado: number,
  hoje: string,
): boolean {
  const v = Number(c.valor);
  if (!Number.isFinite(v) || Math.abs(v - valorEsperado) >= 0.005) return false;
  if (c.status && c.status !== 'PENDING' && c.status !== 'pending') return false;
  const venc = c.vencimento instanceof Date ? c.vencimento.toISOString().slice(0, 10) : String(c.vencimento || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return false; // sem data conhecida: gera uma nova
  return venc >= hoje;
}

export class SubscriptionService {
  private asaasService: AsaasService | null = null;
  private notificationService: NotificationService;
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.notificationService = getNotificationService();
  }

  // Lazy initialization do AsaasService
  private async getAsaas(): Promise<AsaasService> {
    if (!this.asaasService) {
      this.asaasService = await getAsaasService();
    }
    return this.asaasService;
  }

  // ============================================
  // CORE SUBSCRIPTION METHODS
  // ============================================

  /**
   * Criar assinatura completa (Customer + Subscription + Payment no Asaas)
   * Este é o método principal do fluxo de checkout
   */
  async createSubscription(data: CreateSubscriptionData): Promise<ActivateSubscriptionResult> {
    try {
      // 1. Buscar usuário e plano
      const user = await this.storage.getUserById(data.userId);
      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      const plan = await this.storage.getSubscriptionPlanById(data.planId);
      if (!plan || !plan.active) {
        throw new Error('Plano não encontrado ou inativo');
      }

      // 2. Verificar se usuário já tem assinatura ativa
      const existingSubscription = await this.storage.getActiveSubscriptionByUserId(data.userId);
      if (existingSubscription) {
        throw new Error('Usuário já possui uma assinatura ativa');
      }

      // 3. Criar ou obter cliente no Asaas
      let asaasCustomer = await this.storage.getAsaasCustomerByUserId(data.userId);

      if (!asaasCustomer) {
        // Criar cliente no Asaas
        const asaasCustomerResponse = await (await this.getAsaas()).createCustomer({
          name: user.nome,
          email: user.email,
          cpfCnpj: data.cpfCnpj,
          phone: user.telefone || undefined,
          mobilePhone: user.telefone || undefined
        });

        // Salvar no banco
        asaasCustomer = await this.storage.createAsaasCustomer({
          usuarioId: data.userId,
          asaasCustomerId: asaasCustomerResponse.id,
          cpfCnpj: data.cpfCnpj
        });
      }

      // 4. Usar data atual para cobrar imediatamente (primeira cobrança)
      // Conforme doc Asaas: "informe o nextDueDate como a data atual" para cobrar na criação
      const nextDueDate = AsaasService.getTodayForAsaas();

      // 5. Buscar nome do sistema para descrição
      const systemName = await getSystemName();

      // 6. Criar assinatura no Asaas — ciclo (mensal/trimestral/anual) define o
      //    cycle Asaas e o valor (priceMonthly × meses).
      const cfgCiclo = CICLO_ASAAS[data.ciclo || 'mensal'] || CICLO_ASAAS.mensal;
      const valorCiclo = parseFloat(plan.priceMonthly.toString()) * cfgCiclo.meses;
      const asaasSubscription = await (await this.getAsaas()).createSubscription({
        customer: asaasCustomer.asaasCustomerId,
        billingType: 'CREDIT_CARD',
        cycle: cfgCiclo.cycle,
        value: valorCiclo,
        nextDueDate: nextDueDate,
        description: `Assinatura ${plan.name} (${data.ciclo || 'mensal'}) - ${systemName}`,
        creditCard: data.creditCard,
        creditCardHolderInfo: data.creditCardHolderInfo,
        remoteIp: data.remoteIp
      });

      // 6. Criar registro de assinatura no banco
      const subscription = await this.storage.createUserSubscription({
        usuarioId: data.userId,
        planId: data.planId,
        asaasSubscriptionId: asaasSubscription.id,
        status: 'active',
        currentPeriodStart: new Date(),
        // O período atual vai de hoje até o próximo mês
        currentPeriodEnd: new Date(AsaasService.calculateNextDueDate())
      });

      // 7. Buscar primeiro pagamento gerado pelo Asaas
      const asaasPayments = await (await this.getAsaas()).getSubscriptionPayments(asaasSubscription.id, { limit: 1 });
      let payment: PaymentTransaction | null = null;

      if (asaasPayments.data.length > 0) {
        const firstPayment = asaasPayments.data[0];

        console.log(`[SubscriptionService] Primeiro pagamento Asaas:`);
        console.log(`  - ID: ${firstPayment.id}`);
        console.log(`  - Status: ${firstPayment.status}`);
        console.log(`  - Value: ${firstPayment.value}`);

        // Criar registro de pagamento
        payment = await this.storage.createPaymentTransaction({
          usuarioId: data.userId,
          subscriptionId: subscription.id,
          asaasPaymentId: firstPayment.id,
          asaasInvoiceUrl: firstPayment.invoiceUrl,
          amount: firstPayment.value.toString(),
          status: this.mapAsaasPaymentStatus(firstPayment.status),
          paymentMethod: 'credit_card',
          dueDate: firstPayment.dueDate,
          description: `Pagamento ${plan.name} - ${nextDueDate}`,
          metadata: JSON.stringify(firstPayment)
        });

        // Se pagamento foi confirmado, ativar usuário e enviar webhook
        if (firstPayment.status === 'CONFIRMED' || firstPayment.status === 'RECEIVED') {
          console.log(`[SubscriptionService] Pagamento já confirmado! Ativando usuário e enviando webhook...`);
          await this.activateUserSubscription(data.userId, subscription.id);

          // Enviar webhook de ativação (mesmo comportamento da ativação manual)
          await this.sendActivationWebhook(user);
        } else {
          console.log(`[SubscriptionService] Pagamento PENDENTE (${firstPayment.status}). Webhook de ativação será enviado quando PAYMENT_CONFIRMED chegar do Asaas.`);
        }
      }

      // 8. Enviar notificação de boas-vindas
      await this.notificationService.sendSubscriptionActivated(user, plan);

      return {
        subscription,
        payment: payment!,
        success: true,
        message: 'Assinatura criada com sucesso'
      };

    } catch (error) {
      console.error('[SubscriptionService] Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Cria cobrança recorrente no Asaas SEM cartão e devolve a URL da página deles.
   * Enviamos nome/e-mail/telefone/CNPJ que já temos; o cliente só completa o que faltar (CPF/cartão/Pix).
   * A liberação do acesso continua automática no webhook PAYMENT_CONFIRMED / PAYMENT_RECEIVED.
   */
  async createHostedCheckout(
    userId: number,
    ciclo: 'mensal' | 'trimestral' | 'anual',
    cpfCnpjInformado?: string
  ): Promise<{ url: string; ciclo: string }> {
    const user = await this.storage.getUserById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    const cfgCiclo = CICLO_ASAAS[ciclo];
    if (!cfgCiclo) {
      throw new Error('Ciclo inválido (mensal | trimestral | anual)');
    }

    const plans = await this.storage.getActiveSubscriptionPlans();
    if (!plans.length) {
      throw new Error('Nenhum plano ativo. Crie um plano em Pagamentos antes de gerar o link.');
    }

    // O plano vem do TIPO do usuário (PF/PJ), não do "primeiro da lista" — que,
    // ordenada por preço, era sempre o mais barato e cobrava PJ como PF.
    const tipoPessoa = (user as any).tipo_pessoa as string | null | undefined;
    if (!tipoPessoa) {
      throw new Error('Defina se o usuário é Pessoa Física ou Jurídica antes de gerar a cobrança.');
    }
    const plan = resolverPlanoDoUsuario(user, plans);
    if (!plan) {
      throw new Error(`Nenhum plano ativo para ${rotuloModalidade(user as any)}. Cadastre um plano desse tipo em Pagamentos.`);
    }

    // Valor que a cobrança DEVE ter para o plano atual (respeita o override).
    const valorEsperado = parseFloat(plan.priceMonthly.toString()) * cfgCiclo.meses;
    const hoje = AsaasService.getTodayForAsaas();
    // Só reaproveita cobrança com o valor do plano atual E ainda não vencida:
    // entregar um link vencido (ex.: de 21/09 num link gerado em 25/09) confunde
    // o cliente e o ciclo passaria a contar da data antiga.
    const reaproveitavel = (valor: any, vencimento: any, status?: string) =>
      podeReaproveitarCobranca({ valor, vencimento, status }, valorEsperado, hoje);

    const existingActive = await this.storage.getActiveSubscriptionByUserId(userId);
    if (existingActive) {
      // Assinante com mensalidade em aberto (renovação gerada pelo Asaas): o
      // "renovar" devolve a fatura dessa cobrança, em vez de criar outra assinatura.
      const doAtivo = await this.storage.getPaymentTransactionsBySubscriptionId(existingActive.id);
      const aberta = doAtivo
        .filter((p) => p.asaasInvoiceUrl && (p.status === 'pending' || p.status === 'overdue'))
        .sort((a, b) => String((a as any).dueDate || '').localeCompare(String((b as any).dueDate || '')))[0];
      if (aberta?.asaasInvoiceUrl) return { url: aberta.asaasInvoiceUrl, ciclo };
      throw new Error('Sua assinatura está em dia. A próxima cobrança é gerada automaticamente pelo Asaas.');
    }

    const asaas = await this.getAsaas();

    // Reaproveita cobrança pendente já gerada (evita duplicar no Asaas) — MAS só se
    // o valor bater com o plano atual. Se o valor mudou (ex.: virou Consultoria
    // R$ 200), a cobrança antiga é cancelada e uma nova, no valor certo, é criada.
    const existentes = await this.storage.getAllSubscriptionsByUserId(userId);
    const pendente = existentes.find((s) => s.status === 'pending' && s.asaasSubscriptionId);
    if (pendente?.asaasSubscriptionId) {
      const locais = await this.storage.getPaymentTransactionsBySubscriptionId(pendente.id);
      const localPend = locais.find((p) => p.asaasInvoiceUrl && p.status === 'pending');
      if (localPend?.asaasInvoiceUrl && reaproveitavel(localPend.amount, (localPend as any).dueDate)) {
        await this.storage.updateUser(userId, { ciclo_assinatura: ciclo } as any);
        return { url: localPend.asaasInvoiceUrl, ciclo };
      }
      try {
        const asaasPays = await asaas.getSubscriptionPayments(pendente.asaasSubscriptionId, { limit: 5 });
        const aberta = asaasPays.data.find(
          (p) => p.invoiceUrl && reaproveitavel(p.value, p.dueDate, p.status),
        );
        if (aberta?.invoiceUrl) {
          await this.storage.updateUser(userId, { ciclo_assinatura: ciclo } as any);
          return { url: aberta.invoiceUrl, ciclo };
        }
      } catch (err) {
        console.warn('[SubscriptionService] Não reaproveitou cobrança pendente:', err);
      }
      // Chegou aqui = existe pendência vencida ou com VALOR diferente do plano atual.
      // Cancela a antiga (Asaas + local) e gera uma nova, com vencimento hoje.
      try {
        await asaas.cancelSubscription(pendente.asaasSubscriptionId);
        console.log(`[Assinatura] Cobrança pendente antiga cancelada (vencida ou valor != ${valorEsperado}) user=${userId}.`);
      } catch (err) {
        console.warn('[SubscriptionService] Falha ao cancelar cobrança pendente antiga:', err);
      }
      try {
        await this.storage.updateUserSubscription(pendente.id, { status: 'canceled' } as any);
      } catch (err) {
        console.warn('[SubscriptionService] Falha ao marcar assinatura antiga como cancelada:', err);
      }
    }

    let cpfCnpj: string | undefined;
    const informado = (cpfCnpjInformado || '').replace(/\D/g, '');
    if (informado.length === 11 || informado.length === 14) {
      cpfCnpj = informado;
    }
    if (!cpfCnpj && (user as any).tipo_pessoa === 'juridica') {
      const empresas = await this.storage.getEmpresasByUsuarioId(userId);
      const comCnpj = empresas.find((e) => e.cnpj && String(e.cnpj).replace(/\D/g, '').length === 14);
      if (comCnpj?.cnpj) cpfCnpj = String(comCnpj.cnpj).replace(/\D/g, '');
    }
    const customerCache = await this.storage.getAsaasCustomerByUserId(userId);
    if (!cpfCnpj && customerCache?.cpfCnpj) {
      cpfCnpj = customerCache.cpfCnpj.replace(/\D/g, '') || undefined;
    }
    if (!cpfCnpj || !AsaasService.validateCpfCnpj(cpfCnpj)) {
      throw new Error('Para criar esta cobrança é necessário informar o CPF ou CNPJ.');
    }

    let asaasCustomer = customerCache;
    if (!asaasCustomer) {
      const created = await asaas.createCustomer({
        name: user.nome,
        email: user.email,
        phone: user.telefone || undefined,
        mobilePhone: user.telefone || undefined,
        cpfCnpj,
      });
      asaasCustomer = await this.storage.createAsaasCustomer({
        usuarioId: userId,
        asaasCustomerId: created.id,
        cpfCnpj,
      } as any);
    } else if (!asaasCustomer.cpfCnpj && cpfCnpj) {
      await asaas.updateCustomer(asaasCustomer.asaasCustomerId, { cpfCnpj });
      await this.storage.updateAsaasCustomer(asaasCustomer.id, { cpfCnpj });
    }

    const systemName = await getSystemName();
    const valorCiclo = parseFloat(plan.priceMonthly.toString()) * cfgCiclo.meses;
    // Degustação ainda rodando: a 1ª mensalidade vence quando ela termina (pagar
    // antes não faz perder os dias restantes). Senão, vence hoje.
    const nextDueDate = vencimentoPrimeiraCobranca(AsaasService.getTodayForAsaas(), user as any);

    const asaasSubscription = await asaas.createSubscription({
      customer: asaasCustomer.asaasCustomerId,
      billingType: 'UNDEFINED',
      cycle: cfgCiclo.cycle,
      value: valorCiclo,
      nextDueDate,
      description: `Assinatura ${plan.name} (${ciclo}) - ${systemName}`,
      externalReference: `user:${userId}`,
    });

    const periodEnd = fimDoPeriodoPago(nextDueDate, cfgCiclo.meses);
    const subscription = await this.storage.createUserSubscription({
      usuarioId: userId,
      planId: plan.id,
      asaasSubscriptionId: asaasSubscription.id,
      status: 'pending',
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    });

    await this.storage.updateUser(userId, { ciclo_assinatura: ciclo } as any);

    const asaasPayments = await asaas.getSubscriptionPayments(asaasSubscription.id, { limit: 1 });
    if (!asaasPayments.data.length) {
      throw new Error('Asaas não gerou a cobrança. Tente novamente.');
    }
    const firstPayment = asaasPayments.data[0];
    if (!firstPayment.invoiceUrl) {
      throw new Error('Asaas não retornou o link da fatura.');
    }

    await this.storage.createPaymentTransaction({
      usuarioId: userId,
      subscriptionId: subscription.id,
      asaasPaymentId: firstPayment.id,
      asaasInvoiceUrl: firstPayment.invoiceUrl,
      amount: firstPayment.value.toString(),
      status: 'pending',
      paymentMethod: 'undefined',
      dueDate: firstPayment.dueDate,
      description: `Pagamento ${plan.name} (${ciclo})`,
      metadata: JSON.stringify(firstPayment),
    });

    console.log(`[SubscriptionService] Hosted checkout user=${userId} invoice=${firstPayment.invoiceUrl}`);
    return { url: firstPayment.invoiceUrl, ciclo };
  }

  /**
   * Sincroniza o VALOR da assinatura recorrente do usuário no Asaas com o plano
   * atual (respeitando o override plano_forcado_id). Usado quando o admin muda a
   * marcação Base↔Consultoria: se já existe assinatura ativa/pendente no Asaas,
   * atualiza o valor da recorrência E das cobranças em aberto (sem trabalho manual).
   */
  async sincronizarValorAssinatura(
    userId: number,
  ): Promise<{ atualizado: boolean; valor?: number; motivo?: string }> {
    const user = await this.storage.getUserById(userId);
    if (!user) return { atualizado: false, motivo: 'Usuário não encontrado' };

    const ciclo = (((user as any).ciclo_assinatura || 'mensal') as 'mensal' | 'trimestral' | 'anual');
    const cfg = CICLO_ASAAS[ciclo] || CICLO_ASAAS.mensal;

    const plans = await this.storage.getActiveSubscriptionPlans();
    const plan = resolverPlanoDoUsuario(user, plans);
    if (!plan) return { atualizado: false, motivo: `Sem plano ativo para ${rotuloModalidade(user as any)}` };
    const valor = parseFloat(plan.priceMonthly.toString()) * cfg.meses;

    // Assinatura atual (ativa ou pendente) com id no Asaas.
    const todas = await this.storage.getAllSubscriptionsByUserId(userId);
    const atual = todas.find(
      (s) => s.asaasSubscriptionId && (s.status === 'active' || s.status === 'pending'),
    );
    if (!atual?.asaasSubscriptionId) {
      return { atualizado: false, valor, motivo: 'Sem assinatura ativa no Asaas — o novo valor vale na próxima cobrança/renovação.' };
    }

    const asaas = await this.getAsaas();
    await asaas.updateSubscription(atual.asaasSubscriptionId, {
      value: valor,
      updatePendingPayments: true,
    } as any);
    try {
      await this.storage.updateUserSubscription(atual.id, { planId: plan.id } as any);
    } catch { /* referência local — não crítico */ }

    console.log(`[Assinatura] Valor sincronizado no Asaas user=${userId} plano=${plan.planCode} valor=${valor}.`);
    return { atualizado: true, valor };
  }

  /**
   * Usuários com assinatura ativa/pendente no Asaas afetados por um plano:
   * os que já estão nele e os que passariam a usá-lo pela regra de modalidade
   * (ex.: PJ ME quando o plano PJ ME é criado/reativado).
   */
  async assinantesAfetadosPeloPlano(planId: number): Promise<number[]> {
    const plans = await this.storage.getActiveSubscriptionPlans();
    const rows = (await db.execute(sql`
      SELECT DISTINCT us.usuario_id
      FROM user_subscriptions us
      WHERE us.asaas_subscription_id IS NOT NULL
        AND us.status IN ('active', 'pending')
    `)) as any[];
    const afetados: number[] = [];
    for (const r of rows) {
      const userId = Number(r.usuario_id);
      const user = await this.storage.getUserById(userId);
      if (!user) continue;
      const todas = await this.storage.getAllSubscriptionsByUserId(userId);
      const atual = todas.find((s) => s.asaasSubscriptionId && (s.status === 'active' || s.status === 'pending'));
      const resolvido = resolverPlanoDoUsuario(user, plans);
      if (Number(atual?.planId) === planId || resolvido?.id === planId) afetados.push(userId);
    }
    return afetados;
  }

  /**
   * Admin mudou preço/escopo de um plano: reajusta no Asaas a recorrência e as
   * cobranças em aberto de todos os assinantes afetados. Um erro não para os demais.
   */
  async sincronizarAssinantesDoPlano(
    planId: number,
  ): Promise<{ total: number; atualizados: number; falhas: { userId: number; motivo: string }[] }> {
    const ids = await this.assinantesAfetadosPeloPlano(planId);
    const falhas: { userId: number; motivo: string }[] = [];
    let atualizados = 0;
    for (const userId of ids) {
      try {
        const r = await this.sincronizarValorAssinatura(userId);
        if (r.atualizado) atualizados++;
        else if (r.motivo) falhas.push({ userId, motivo: r.motivo });
      } catch (e: any) {
        falhas.push({ userId, motivo: e?.response?.data?.errors?.[0]?.description || e?.message || 'erro no Asaas' });
      }
    }
    console.log(`[Assinatura] Plano ${planId}: ${atualizados}/${ids.length} assinaturas reajustadas no Asaas, ${falhas.length} falha(s).`);
    return { total: ids.length, atualizados, falhas };
  }

  /**
   * Confere no Asaas (fonte da verdade) se o cliente pagou alguma cobrança que
   * o sistema ainda não reconheceu — webhook perdido, fila pausada, token
   * errado — e libera o acesso. Idempotente: só age quando o pagamento
   * estende o acesso atual ou o usuário ainda não está como 'ativa'.
   */
  async sincronizarPagamentosAsaas(userId: number): Promise<{
    ativado: boolean;
    pagos: number;
    acessoAte?: Date;
    motivo?: string;
  }> {
    const user = await this.storage.getUserById(userId);
    if (!user) return { ativado: false, pagos: 0, motivo: 'Usuário não encontrado' };
    const cliente = await this.storage.getAsaasCustomerByUserId(userId);
    if (!cliente?.asaasCustomerId) return { ativado: false, pagos: 0, motivo: 'Cliente sem cadastro no Asaas' };

    const asaas = await this.getAsaas();
    const lista = await asaas.getCustomerPayments(cliente.asaasCustomerId, { limit: 50 });
    const PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
    const pagos = (lista.data || [])
      .filter((p: any) => PAGO.includes(String(p.status || '').toUpperCase()) && p.dueDate)
      .sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate)));
    if (!pagos.length) return { ativado: false, pagos: 0, motivo: 'Nenhum pagamento confirmado no Asaas' };

    const subs = await this.storage.getAllSubscriptionsByUserId(userId);
    const ciclo = ((user as any).ciclo_assinatura as string) || 'mensal';
    const meses = CICLO_ASAAS[ciclo]?.meses || 1;
    let acessoAte: Date | undefined;
    let ativado = false;

    for (const p of pagos as any[]) {
      const localSub =
        subs.find((x) => x.asaasSubscriptionId && x.asaasSubscriptionId === p.subscription) ||
        [...subs].sort((a, b) => b.id - a.id)[0];
      if (!localSub) continue;

      let local = await this.storage.getPaymentTransactionByAsaasId(p.id);
      if (!local) {
        local = await this.storage.createPaymentTransaction({
          usuarioId: userId,
          subscriptionId: localSub.id,
          asaasPaymentId: p.id,
          asaasInvoiceUrl: p.invoiceUrl,
          amount: String(p.value ?? '0'),
          status: 'confirmed',
          paymentMethod: String(p.billingType || 'undefined').toLowerCase(),
          dueDate: p.dueDate,
          confirmedDate: new Date(),
          description: p.description || 'Cobrança Asaas (sincronizada)',
          metadata: JSON.stringify(p),
        } as any);
      } else if (local.status !== 'confirmed') {
        await this.storage.updatePaymentTransaction(local.id, { status: 'confirmed', confirmedDate: new Date() } as any);
      }

      // Já refletido? (ativa e com acesso até, pelo menos, o período desta cobrança)
      const atual = await this.storage.getUserById(userId);
      const alvo = fimDoPeriodoPago(String(p.dueDate).slice(0, 10), meses);
      const expAtual = (atual as any)?.data_expiracao_assinatura ? new Date((atual as any).data_expiracao_assinatura) : null;
      if ((atual as any)?.status_assinatura === 'ativa' && expAtual && expAtual >= alvo) {
        acessoAte = expAtual;
        continue;
      }
      acessoAte = await this.activateUserSubscription(userId, localSub.id, String(p.dueDate).slice(0, 10));
      ativado = true;
      try {
        const { avisarPagamentoConfirmado } = await import('./lembretes-cobranca');
        await avisarPagamentoConfirmado((await this.storage.getUserById(userId)) as any, p.id, Number(p.value), acessoAte);
      } catch { /* aviso é best-effort */ }
      console.log(`[Assinatura] Pagamento ${p.id} (venc. ${p.dueDate}) reconhecido pela sincronização — user ${userId} até ${acessoAte.toISOString()}`);
    }
    return { ativado, pagos: pagos.length, acessoAte };
  }

  /**
   * Ativar assinatura do usuário (após confirmação de pagamento)
   */
  async activateUserSubscription(userId: number, subscriptionId: number, vencimento?: string | null): Promise<Date> {
    try {
      const user = await this.storage.getUserById(userId);
      const ciclo = ((user as any)?.ciclo_assinatura as string) || 'mensal';
      const meses = CICLO_ASAAS[ciclo]?.meses || 1;
      const agora = new Date();
      // Ancorado no VENCIMENTO da cobrança paga (+ ciclo + tolerância), não no
      // momento da confirmação: pagar antes não perde dias, pagar atrasado não
      // desalinha do Asaas, e CONFIRMED + RECEIVED (cartão) dão o mesmo resultado.
      // Nunca reduz um acesso já concedido.
      const periodEnd = novaExpiracao((user as any)?.data_expiracao_assinatura, vencimento, meses, agora);

      await this.storage.updateUserSubscription(subscriptionId, {
        status: 'active',
        currentPeriodStart: agora,
        currentPeriodEnd: periodEnd,
      });

      // Fonte de acesso do app é data_expiracao_assinatura — precisa ir junto.
      await this.storage.updateUser(userId, {
        ativo: true,
        subscriptionActive: true,
        status_assinatura: 'ativa',
        ciclo_assinatura: ciclo,
        data_expiracao_assinatura: periodEnd,
      } as any);

      console.log(`[SubscriptionService] User ${userId} subscription activated until ${periodEnd.toISOString()}`);
      return periodEnd;
    } catch (error) {
      console.error('[SubscriptionService] Error activating subscription:', error);
      throw error;
    }
  }

  /**
   * Enviar webhook de ativação (idêntico à ativação manual do admin)
   */
  async sendActivationWebhook(user: User): Promise<void> {
    try {
      console.log(`[SubscriptionService] Enviando webhook de ativação para usuário ${user.nome}...`);

      const postgres = (await import('postgres')).default;
      const client = postgres(process.env.DATABASE_URL || '', { prepare: false });

      // Buscar mensagem de ativação personalizada
      const result = await client`
        SELECT title, message, email_content
        FROM welcome_messages
        WHERE type = 'activated'
      `;

      let activationMessage = {
        title: 'Sua conta foi ativada!',
        message: 'Olá! Sua conta foi ativada com sucesso. Agora você tem acesso completo a todos os recursos da plataforma.',
        email_content: 'Sua conta foi ativada com sucesso!'
      };

      if (result.length > 0) {
        activationMessage = result[0];
        // Processar tags na mensagem
        activationMessage.title = this.notificationService.processMessageTags(activationMessage.title, user);
        activationMessage.message = this.notificationService.processMessageTags(activationMessage.message, user);
        activationMessage.email_content = this.notificationService.processMessageTags(
          activationMessage.email_content || activationMessage.message,
          user
        );
      }

      // Buscar token do usuário
      const userTokens = await this.storage.getApiTokensByUserId(user.id);
      const userToken = userTokens && userTokens.length > 0 ? userTokens[0].token : null;

      // IMPORTANTE: NÃO resetar a senha na confirmação de pagamento.
      // O cliente já usa o sistema (degustação) e a senha atual deve permanecer.
      // Resetar aqui (e não entregar) trancava o cliente para fora. A liberação
      // de acesso é feita por activateUserSubscription (data_expiracao_assinatura).

      // Enviar webhook de ativação com payload COMPLETO
      const webhookData = {
        evento: "usuario_ativado",
        timestamp: new Date().toISOString(),
        dominio: process.env.BASE_URL || 'https://app.controledinheiro.com.br',
        id: user.id,
        nome: user.nome,
        email: user.email,
        telefone: user.telefone,
        tipo_usuario: user.tipo_usuario,
        data_cadastro: user.data_cadastro,
        token: userToken,
        acesso_web: {
          usuario: user.email
        },
        mensagem_ativacao: {
          titulo: activationMessage.title,
          mensagem: activationMessage.message,
          conteudo_email: activationMessage.email_content
        }
      };

      console.log('[SubscriptionService] Sending activation webhook (payload com PII omitido do log)');

      // === N8N DESATIVADO — pipeline agora roda via app (POST /api/webhook/uazapi) ===
      // const webhookResponse = await fetch(
      //   process.env.WEBHOOK_ATIVACAO_URL || 'https://prod-wf.pulsofinanceiro.net.br/webhook/ativacao',
      //   {
      //     method: 'POST',
      //     headers: {
      //       'Content-Type': 'application/json',
      //     },
      //     body: JSON.stringify(webhookData)
      //   }
      // );
      //
      // if (webhookResponse.ok) {
      //   console.log('[SubscriptionService] Activation webhook sent successfully');
      // } else {
      //   console.error('[SubscriptionService] Error sending activation webhook:', webhookResponse.status);
      // }
      console.log('[SubscriptionService] ✅ Webhook N8N desativado — ativação via pipeline interno.');

      await client.end();
    } catch (error) {
      console.error('[SubscriptionService] Error sending activation webhook:', error);
      // Não falhar a operação principal se o webhook falhar
    }
  }

  /**
   * Desativar assinatura do usuário (pagamento atrasado)
   */
  async deactivateUserSubscription(userId: number, subscriptionId: number, reason: string): Promise<void> {
    try {
      // Atualizar subscription
      await this.storage.updateUserSubscription(subscriptionId, {
        status: 'past_due'
      });

      // Atualizar usuário. IMPORTANTE: o acesso do app é regido por
      // data_expiracao_assinatura — para o corte ter efeito, retroagi-la para
      // agora. Usado em estorno/chargeback/pagamento desfeito/3 falhas (corte
      // imediato). Cancelamento voluntário é tratado à parte (mantém o ciclo pago).
      await this.storage.updateUser(userId, {
        subscriptionActive: false,
        status_assinatura: 'inativa',
        data_expiracao_assinatura: new Date(),
      } as any);

      // Enviar notificação
      const user = await this.storage.getUserById(userId);
      if (user) {
        await this.notificationService.sendSubscriptionSuspended(user, reason);
      }

      console.log(`[SubscriptionService] User ${userId} subscription deactivated: ${reason}`);
    } catch (error) {
      console.error('[SubscriptionService] Error deactivating subscription:', error);
      throw error;
    }
  }

  /**
   * Cancelar assinatura (usuário pede para sair).
   * Política: NÃO corta o acesso na hora — mantém data_expiracao_assinatura
   * (ciclo já pago). Só impede a próxima cobrança no Asaas.
   */
  async cancelSubscription(userId: number, reason: string): Promise<void> {
    try {
      const subscription = await this.storage.getActiveSubscriptionByUserId(userId);

      if (subscription) {
        if (subscription.asaasSubscriptionId) {
          await (await this.getAsaas()).cancelSubscription(subscription.asaasSubscriptionId);
        }
        await this.storage.updateUserSubscription(subscription.id, {
          status: 'canceled',
          canceledAt: new Date(),
          cancellationReason: reason
        });
      }

      await this.storage.updateUser(userId, {
        subscriptionActive: false,
        status_assinatura: 'cancelada',
        data_cancelamento: new Date(),
        motivo_cancelamento: reason
      });

      await this.storage.createCancellationHistory({
        usuario_id: userId,
        motivo_cancelamento: reason,
        tipo_cancelamento: 'voluntario'
      });

      const user = await this.storage.getUserById(userId);
      if (user) {
        await this.notificationService.sendSubscriptionCanceled(user, reason);
      }

      console.log(`[SubscriptionService] User ${userId} subscription canceled (acesso até o fim do ciclo)`);
    } catch (error) {
      console.error('[SubscriptionService] Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Processar falha de pagamento (webhook ou job)
   */
  async handlePaymentFailure(paymentId: string, retryCount: number): Promise<void> {
    try {
      const payment = await this.storage.getPaymentTransactionByAsaasId(paymentId);
      if (!payment) {
        console.warn(`[SubscriptionService] Payment ${paymentId} not found in database`);
        return;
      }

      // Atualizar contador de tentativas
      await this.storage.updatePaymentTransaction(payment.id, {
        status: 'overdue',
        retryCount: retryCount
      });

      // Se atingiu 3 tentativas, bloquear acesso
      if (retryCount >= 3) {
        await this.deactivateUserSubscription(
          payment.usuarioId,
          payment.subscriptionId!,
          'Pagamento não processado após 3 tentativas'
        );

        const user = await this.storage.getUserById(payment.usuarioId);
        if (user) {
          await this.notificationService.sendPaymentFailedFinal(user);
        }
      } else {
        // Enviar notificação de tentativa
        const user = await this.storage.getUserById(payment.usuarioId);
        if (user) {
          await this.notificationService.sendPaymentFailed(user, retryCount);
        }
      }

      console.log(`[SubscriptionService] Payment failure handled for payment ${paymentId}, retry ${retryCount}/3`);
    } catch (error) {
      console.error('[SubscriptionService] Error handling payment failure:', error);
      throw error;
    }
  }

  /**
   * Sincronizar status de assinatura com Asaas
   */
  async syncSubscriptionStatus(userId: number): Promise<void> {
    try {
      const subscription = await this.storage.getActiveSubscriptionByUserId(userId);
      if (!subscription || !subscription.asaasSubscriptionId) {
        return;
      }

      // Buscar status atual no Asaas
      const asaasSubscription = await (await this.getAsaas()).getSubscription(subscription.asaasSubscriptionId);

      // Mapear status
      const newStatus = this.mapAsaasSubscriptionStatus(asaasSubscription.status);

      // Atualizar se necessário
      if (subscription.status !== newStatus) {
        await this.storage.updateUserSubscription(subscription.id, {
          status: newStatus
        });

        const isActive = newStatus === 'active';
        await this.storage.updateUser(userId, {
          subscriptionActive: isActive
        });

        console.log(`[SubscriptionService] Synced subscription ${subscription.id}: ${subscription.status} -> ${newStatus}`);
      }
    } catch (error) {
      console.error('[SubscriptionService] Error syncing subscription status:', error);
      throw error;
    }
  }

  /**
   * Verificar se usuário tem acesso ativo
   */
  async checkUserAccess(userId: number): Promise<boolean> {
    try {
      const user = await this.storage.getUserById(userId);
      if (!user) return false;

      // Admin/superadmin sempre têm acesso
      if (user.tipo_usuario === 'super_admin' || user.tipo_usuario === 'admin') return true;

      // Fonte ÚNICA de verdade: tem acesso = data de expiração no futuro.
      // (trial ou assinatura paga ambos gravam data_expiracao_assinatura;
      // acesso ilimitado = data bem no futuro definida pelo admin.)
      const venc = (user as any).data_expiracao_assinatura ? new Date((user as any).data_expiracao_assinatura) : null;
      const temAcesso = !!venc && venc.getTime() > Date.now();

      // Mantém o campo denormalizado honesto (espelho).
      if ((user.subscriptionActive || false) !== temAcesso) {
        try { await this.storage.updateUser(userId, { subscriptionActive: temAcesso } as any); } catch { /* não bloquear por erro de sync */ }
      }
      return temAcesso;
    } catch (error) {
      console.error('[SubscriptionService] Error checking user access:', error);
      return false;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Mapear status de pagamento do Asaas para nosso sistema
   */
  private mapAsaasPaymentStatus(asaasStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'PENDING': 'pending',
      'RECEIVED': 'confirmed',
      'CONFIRMED': 'confirmed',
      'OVERDUE': 'overdue',
      'REFUNDED': 'refunded',
      'RECEIVED_IN_CASH': 'received_in_cash'
    };

    return statusMap[asaasStatus] || 'pending';
  }

  /**
   * Mapear status de assinatura do Asaas para nosso sistema
   */
  private mapAsaasSubscriptionStatus(asaasStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      'ACTIVE': 'active',
      'INACTIVE': 'canceled',
      'EXPIRED': 'expired'
    };

    return statusMap[asaasStatus] || 'active';
  }
}

// Singleton instance
let subscriptionServiceInstance: SubscriptionService | null = null;

/**
 * Get singleton instance do SubscriptionService
 */
export function getSubscriptionService(storage: IStorage): SubscriptionService {
  if (!subscriptionServiceInstance) {
    subscriptionServiceInstance = new SubscriptionService(storage);
  }
  return subscriptionServiceInstance;
}
