import { storage } from "../storage";
import { uazapiService } from "../services/uazapi.service";
import { InsertEmpresa } from "@shared/schema";

export type OnboardingStep =
  | 'INITIAL_CHOICE'
  | 'ASKING_RESPONSIBLE'
  | 'ASKING_CNPJ'
  | 'ASKING_RAZAO_SOCIAL'
  | 'ASKING_EMAIL'
  | 'ASKING_PHONE'
  | 'COMPLETED';

interface CollectedData {
  nome_responsavel?: string;
  cnpj?: string;
  razao_social?: string;
  email?: string;
  telefone?: string;
}

export class WhatsAppOnboardingService {
  private static readonly STEPS: Record<OnboardingStep, string> = {
    INITIAL_CHOICE: "Prefere cadastrar sua empresa manualmente no sistema ou prefere que eu te guie por aqui no WhatsApp? 🤔\n\nResponda:\n*1* — Manualmente\n*2* — Guiado por aqui",
    ASKING_RESPONSIBLE: "Perfeito! Vamos começar. 😊\n\nPara começar, qual o seu *nome completo* (responsável pela empresa)?",
    ASKING_CNPJ: "Obrigado! Agora, por favor, me envie o *CNPJ* da empresa (apenas números).",
    ASKING_RAZAO_SOCIAL: "Recebido. E qual a *Razão Social* da empresa?",
    ASKING_EMAIL: "Quase lá! Qual o *e-mail de contato* financeiro da empresa?",
    ASKING_PHONE: "Por último, qual o *telefone de contato* da empresa?",
    COMPLETED: "Tudo pronto! ✅ Sua empresa foi cadastrada com sucesso e o ambiente financeiro já está configurado.\n\nVocê já pode acessar o painel do sistema para começar a gerir suas finanças!"
  };

  private static validateCNPJ(cnpj: string): boolean {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) return false;
    return /^\d{14}$/.test(cleanCnpj);
  }

  private static validateEmail(email: string): boolean {
    return /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
  }

  public async handleMessage(remoteJid: string, text: string, userId: number, BaseUrl: string, token: string): Promise<{ handled: boolean, response?: string }> {
    let state = await storage.getWhatsAppOnboardingState(remoteJid);

    // 1. Se não existe estado, iniciamos o fluxo
    if (!state) {
      await storage.createWhatsAppOnboardingState({
        remoteJid,
        usuarioId: userId,
        currentStep: 'INITIAL_CHOICE',
        collectedData: JSON.stringify({}),
        updatedAt: new Date()
      });

      return {
        handled: true,
        response: WhatsAppOnboardingService.STEPS.INITIAL_CHOICE
      };
    }

    const currentStep = state.currentStep as OnboardingStep;
    const data: CollectedData = JSON.parse(state.collectedData || '{}');
    const normalizedText = text.trim().toLowerCase();

    // 2. Máquina de Estados
    switch (currentStep) {
      case 'INITIAL_CHOICE':
        if (normalizedText === '1' || normalizedText.includes('manual')) {
          await storage.deleteWhatsAppOnboardingState(remoteJid);
          return {
            handled: true,
            response: "Combinado! Você pode realizar o cadastro diretamente no painel de configurações da sua conta. Estou à disposição se precisar de ajuda! 👋"
          };
        }
        if (normalizedText === '2' || normalizedText.includes('guiado')) {
          await storage.updateWhatsAppOnboardingState(remoteJid, { currentStep: 'ASKING_RESPONSIBLE' });
          return {
            handled: true,
            response: WhatsAppOnboardingService.STEPS.ASKING_RESPONSIBLE
          };
        }
        return {
          handled: true,
          response: "Não entendi. Por favor, responda *1* para Manual ou *2* para Guiado. 😊"
        };

      case 'ASKING_RESPONSIBLE':
        data.nome_responsavel = text.trim();
        await storage.updateWhatsAppOnboardingState(remoteJid, {
          currentStep: 'ASKING_CNPJ',
          collectedData: JSON.stringify(data),
          updatedAt: new Date()
        });
        return {
          handled: true,
          response: WhatsAppOnboardingService.STEPS.ASKING_CNPJ
        };

      case 'ASKING_CNPJ':
        const cleanCnpj = text.replace(/\\D/g, '');
        if (!WhatsAppOnboardingService.validateCNPJ(cleanCnpj)) {
          return {
            handled: true,
            response: "O CNPJ enviado parece inválido. Por favor, envie o *CNPJ com 14 dígitos* (apenas números). ✍️"
          };
        }
        data.cnpj = cleanCnpj;
        await storage.updateWhatsAppOnboardingState(remoteJid, {
          currentStep: 'ASKING_RAZAO_SOCIAL',
          collectedData: JSON.stringify(data),
          updatedAt: new Date()
        });
        return {
          handled: true,
          response: WhatsAppOnboardingService.STEPS.ASKING_RAZAO_SOCIAL
        };

      case 'ASKING_RAZAO_SOCIAL':
        data.razao_social = text.trim();
        await storage.updateWhatsAppOnboardingState(remoteJid, {
          currentStep: 'ASKING_EMAIL',
          collectedData: JSON.stringify(data),
          updatedAt: new Date()
        });
        return {
          handled: true,
          response: WhatsAppOnboardingService.STEPS.ASKING_EMAIL
        };

      case 'ASKING_EMAIL':
        if (!WhatsAppOnboardingService.validateEmail(text.trim())) {
          return {
            handled: true,
            response: "O e-mail fornecido não parece válido. Poderia enviar novamente? 📧"
          };
        }
        data.email = text.trim();
        await storage.updateWhatsAppOnboardingState(remoteJid, {
          currentStep: 'ASKING_PHONE',
          collectedData: JSON.stringify(data),
          updatedAt: new Date()
        });
        return {
          handled: true,
          response: WhatsAppOnboardingService.STEPS.ASKING_PHONE
        };

      case 'ASKING_PHONE':
        data.telefone = text.replace(/\\D/g, '');

        // FINALIZAÇÃO: Cria a empresa no banco de dados
        try {
          const empresa = await storage.createEmpresa({
            usuario_id: userId,
            razao_social: data.razao_social || 'Empresa Sem Nome',
            cnpj: data.cnpj,
            nome_fantasia: data.razao_social,
            segmento: 'servicos', // Default
            ativo: true
          } as InsertEmpresa);

          // Seed do plano de contas PJ automaticamente
          await storage.seedEmpresasContas(empresa.id);

          // Limpa o estado de onboarding
          await storage.deleteWhatsAppOnboardingState(remoteJid);

          return {
            handled: true,
            response: WhatsAppOnboardingService.STEPS.COMPLETED
          };
        } catch (error) {
          console.error("[OnboardingService] Erro ao criar empresa:", error);
          return {
            handled: true,
            response: "Houve um erro ao finalizar o cadastro da sua empresa. Por favor, tente novamente mais tarde ou contate o suporte. ⚠️"
          };
        }

      default:
        await storage.deleteWhatsAppOnboardingState(remoteJid);
        return { handled: false };
    }
  }
}
