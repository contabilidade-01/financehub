"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppOnboardingService = void 0;
const storage_1 = require("../storage");
class WhatsAppOnboardingService {
    static validateCNPJ(cnpj) {
        const cleanCnpj = cnpj.replace(/\D/g, '');
        if (cleanCnpj.length !== 14)
            return false;
        return /^\d{14}$/.test(cleanCnpj);
    }
    static validateEmail(email) {
        return /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
    }
    async handleMessage(remoteJid, text, userId, BaseUrl, token, tipoPessoa) {
        if (tipoPessoa === 'fisica') {
            await storage_1.storage.deleteWhatsAppOnboardingState(remoteJid);
            return { handled: false };
        }
        let state = await storage_1.storage.getWhatsAppOnboardingState(remoteJid);
        // 1. Se não existe estado, NÃO iniciamos o fluxo automaticamente.
        // O fluxo de onboarding deve ser disparado por um gatilho específico no Controller.
        if (!state) {
            return {
                handled: false
            };
        }
        const currentStep = state.currentStep;
        const data = JSON.parse(state.collectedData || '{}');
        const normalizedText = text.trim().toLowerCase();
        // 2. Máquina de Estados
        switch (currentStep) {
            case 'INITIAL_CHOICE':
                if (normalizedText === '1' || normalizedText.includes('manual')) {
                    await storage_1.storage.deleteWhatsAppOnboardingState(remoteJid);
                    return {
                        handled: true,
                        response: "Combinado! Você pode realizar o cadastro diretamente no painel de configurações da sua conta. Estou à disposição se precisar de ajuda! 👋"
                    };
                }
                if (normalizedText === '2' || normalizedText.includes('guiado')) {
                    await storage_1.storage.updateWhatsAppOnboardingState(remoteJid, { currentStep: 'ASKING_RESPONSIBLE' });
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
                await storage_1.storage.updateWhatsAppOnboardingState(remoteJid, {
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
                await storage_1.storage.updateWhatsAppOnboardingState(remoteJid, {
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
                await storage_1.storage.updateWhatsAppOnboardingState(remoteJid, {
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
                await storage_1.storage.updateWhatsAppOnboardingState(remoteJid, {
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
                    // Um login = uma empresa — se já existe, encerra onboarding e segue.
                    const jaTem = await storage_1.storage.getEmpresasByUsuarioId(userId);
                    if (jaTem.length > 0) {
                        await storage_1.storage.deleteWhatsAppOnboardingState(remoteJid);
                        const nome = jaTem[0].nome_fantasia || jaTem[0].razao_social;
                        return {
                            handled: true,
                            response: `Você já tem a empresa *${nome}* cadastrada. Pode lançar normalmente! 👍`,
                        };
                    }
                    const empresa = await storage_1.storage.createEmpresa({
                        usuario_id: userId,
                        razao_social: data.razao_social || 'Empresa Sem Nome',
                        cnpj: data.cnpj,
                        nome_fantasia: data.razao_social,
                        segmento: 'servicos', // Default
                        ativo: true
                    });
                    // Seed do plano de contas PJ automaticamente
                    await storage_1.storage.seedEmpresasContas(empresa.id);
                    const { garantirCaixinhaPj } = await Promise.resolve().then(() => __importStar(require("./meio-pagamento-pj")));
                    await garantirCaixinhaPj(empresa.id, userId);
                    // Limpa o estado de onboarding
                    await storage_1.storage.deleteWhatsAppOnboardingState(remoteJid);
                    return {
                        handled: true,
                        response: WhatsAppOnboardingService.STEPS.COMPLETED
                    };
                }
                catch (error) {
                    console.error("[OnboardingService] Erro ao criar empresa:", error);
                    if ((error === null || error === void 0 ? void 0 : error.code) === "EMPRESA_UNICA" || (error === null || error === void 0 ? void 0 : error.status) === 409) {
                        await storage_1.storage.deleteWhatsAppOnboardingState(remoteJid);
                        return {
                            handled: true,
                            response: "Você já possui uma empresa neste login. Pode usar o sistema normalmente! 👍",
                        };
                    }
                    return {
                        handled: true,
                        response: "Houve um erro ao finalizar o cadastro da sua empresa. Por favor, tente novamente mais tarde ou contate o suporte. ⚠️"
                    };
                }
            default:
                await storage_1.storage.deleteWhatsAppOnboardingState(remoteJid);
                return { handled: false };
        }
    }
}
exports.WhatsAppOnboardingService = WhatsAppOnboardingService;
WhatsAppOnboardingService.STEPS = {
    INITIAL_CHOICE: "Prefere cadastrar sua empresa manualmente no sistema ou prefere que eu te guie por aqui no WhatsApp? 🤔\n\nResponda:\n*1* — Manualmente\n*2* — Guiado por aqui",
    ASKING_RESPONSIBLE: "Perfeito! Vamos começar. 😊\n\nPara começar, qual o seu *nome completo* (responsável pela empresa)?",
    ASKING_CNPJ: "Obrigado! Agora, por favor, me envie o *CNPJ* da empresa (apenas números).",
    ASKING_RAZAO_SOCIAL: "Recebido. E qual a *Razão Social* da empresa?",
    ASKING_EMAIL: "Quase lá! Qual o *e-mail de contato* financeiro da empresa?",
    ASKING_PHONE: "Por último, qual o *telefone de contato* da empresa?",
    COMPLETED: "Tudo pronto! ✅ Sua empresa foi cadastrada com sucesso e o ambiente financeiro já está configurado.\n\nVocê já pode acessar o painel do sistema para começar a gerir suas finanças!"
};
