"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uazapiService = exports.UazapiService = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * UazAPI Service — cliente HTTP para o gateway WhatsApp UazAPI.
 * Funções: download de mídia, envio de texto/imagem/menu.
 *
 * O baseUrl e token vêm do payload do webhook (cada instância UazAPI pode ter URL própria).
 * Exemplo: baseUrl = "https://nescon.uazapi.com", token = "65952a7b-..."
 */
class UazapiService {
    /**
     * Faz download de mídia (áudio/imagem/pdf) em base64.
     * POST {baseUrl}/message/download
     */
    async downloadMedia(baseUrl, token, messageId) {
        const response = await axios_1.default.post(`${baseUrl}/message/download`, {
            id: messageId,
            return_base64: true,
            return_link: false,
        }, {
            headers: { token },
            timeout: 30000,
        });
        return {
            base64Data: response.data.base64Data,
            mimetype: response.data.mimetype || "application/octet-stream",
        };
    }
    /**
     * Envia mensagem de texto via UazAPI.
     * POST {baseUrl}/send/text
     */
    async sendText(baseUrl, token, chatId, text) {
        await axios_1.default.post(`${baseUrl}/send/text`, {
            number: chatId,
            text,
            readchat: "true",
            linkPreview: "true",
        }, {
            headers: { token },
            timeout: 15000,
        });
    }
    /**
     * Envia mídia (imagem) com caption via UazAPI.
     * POST {baseUrl}/send/media
     */
    async sendMedia(baseUrl, token, chatId, fileUrl, caption) {
        await axios_1.default.post(`${baseUrl}/send/media`, {
            number: chatId,
            type: "image",
            file: fileUrl,
            text: caption,
        }, {
            headers: { token },
            timeout: 15000,
        });
    }
    /**
     * Envia menu com botões (para link de pagamento, etc).
     * POST {baseUrl}/send/menu
     *
     * URL button (UazAPI / WhatsApp): "Rótulo|https://..." — o WhatsApp NÃO
     * renderiza markdown [texto](url) em conversa comum; o botão CTA é o
     * formato suportado (texto do botão ≤ 20 caracteres).
     */
    async sendMenu(baseUrl, token, chatId, text, choices, footerText) {
        await axios_1.default.post(`${baseUrl}/send/menu`, Object.assign({ number: chatId, type: "button", text,
            choices }, (footerText ? { footerText } : {})), {
            headers: { token },
            timeout: 15000,
        });
    }
    /**
     * Botão clicável com URL. Se o menu interativo falhar (conta não-Business),
     * cai no texto com o link — WhatsApp não permite hiperlink markdown.
     */
    async sendUrlButton(baseUrl, token, chatId, text, buttonLabel, url, footerText) {
        const label = buttonLabel.slice(0, 20);
        try {
            await this.sendMenu(baseUrl, token, chatId, text, [`${label}|${url}`], footerText);
        }
        catch (err) {
            console.error("[UazAPI] sendUrlButton falhou, enviando texto:", (err === null || err === void 0 ? void 0 : err.message) || err);
            await this.sendText(baseUrl, token, chatId, `${text}\n\n${url}`);
        }
    }
}
exports.UazapiService = UazapiService;
exports.uazapiService = new UazapiService();
