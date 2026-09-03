import axios from "axios";

/**
 * UazAPI Service — cliente HTTP para o gateway WhatsApp UazAPI.
 * Funções: download de mídia, envio de texto/imagem/menu.
 *
 * O baseUrl e token vêm do payload do webhook (cada instância UazAPI pode ter URL própria).
 * Exemplo: baseUrl = "https://nescon.uazapi.com", token = "65952a7b-..."
 */

export class UazapiService {
  /**
   * Faz download de mídia (áudio/imagem/pdf) em base64.
   * POST {baseUrl}/message/download
   */
  async downloadMedia(baseUrl: string, token: string, messageId: string): Promise<{ base64Data: string; mimetype: string }> {
    const response = await axios.post(
      `${baseUrl}/message/download`,
      {
        id: messageId,
        return_base64: true,
        return_link: false,
      },
      {
        headers: { token },
        timeout: 30000,
      }
    );

    return {
      base64Data: response.data.base64Data,
      mimetype: response.data.mimetype || "application/octet-stream",
    };
  }

  /**
   * Envia mensagem de texto via UazAPI.
   * POST {baseUrl}/send/text
   */
  async sendText(baseUrl: string, token: string, chatId: string, text: string): Promise<void> {
    await axios.post(
      `${baseUrl}/send/text`,
      {
        number: chatId,
        text,
        readchat: "true",
        linkPreview: "true",
      },
      {
        headers: { token },
        timeout: 15000,
      }
    );
  }

  /**
   * Envia mídia (imagem) com caption via UazAPI.
   * POST {baseUrl}/send/media
   */
  async sendMedia(baseUrl: string, token: string, chatId: string, fileUrl: string, caption: string): Promise<void> {
    await axios.post(
      `${baseUrl}/send/media`,
      {
        number: chatId,
        type: "image",
        file: fileUrl,
        text: caption,
      },
      {
        headers: { token },
        timeout: 15000,
      }
    );
  }

  /**
   * Envia menu com botões (para link de pagamento, etc).
   * POST {baseUrl}/send/menu
   *
   * URL button (UazAPI / WhatsApp): "Rótulo|https://..." — o WhatsApp NÃO
   * renderiza markdown [texto](url) em conversa comum; o botão CTA é o
   * formato suportado (texto do botão ≤ 20 caracteres).
   */
  async sendMenu(
    baseUrl: string,
    token: string,
    chatId: string,
    text: string,
    choices: string[],
    footerText?: string
  ): Promise<void> {
    await axios.post(
      `${baseUrl}/send/menu`,
      {
        number: chatId,
        type: "button",
        text,
        choices,
        ...(footerText ? { footerText } : {}),
      },
      {
        headers: { token },
        timeout: 15000,
      }
    );
  }

  /**
   * Botão clicável com URL. Se o menu interativo falhar (conta não-Business),
   * cai no texto com o link — WhatsApp não permite hiperlink markdown.
   */
  async sendUrlButton(
    baseUrl: string,
    token: string,
    chatId: string,
    text: string,
    buttonLabel: string,
    url: string,
    footerText?: string
  ): Promise<void> {
    const label = buttonLabel.slice(0, 20);
    try {
      await this.sendMenu(baseUrl, token, chatId, text, [`${label}|${url}`], footerText);
    } catch (err: any) {
      console.error("[UazAPI] sendUrlButton falhou, enviando texto:", err?.message || err);
      await this.sendText(baseUrl, token, chatId, `${text}\n\n${url}`);
    }
  }
}

export const uazapiService = new UazapiService();
