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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testQRCodeEndpoints = exports.debugWahaEndpoints = exports.confirmPairingCode = exports.sendPairingCode = exports.getSessionQRCode = exports.getWahaSessions = exports.deleteWahaSession = exports.stopWahaSession = exports.startWahaSession = exports.updateWahaSession = exports.createWahaSession = exports.testWahaConnection = exports.updateWahaConfig = exports.getWahaConfig = void 0;
const postgres_1 = __importDefault(require("postgres"));
// Configuração da conexão
const getClient = () => (0, postgres_1.default)(process.env.DATABASE_URL || '', { prepare: false });
// Função para gerar hash único para webhook
const generateWebhookHash = async (sessionName) => {
    const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
    // Gerar hash SHA-256 da sessão + timestamp + random
    const data = `${sessionName}_${Date.now()}_${Math.random()}`;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    // Pegar os primeiros 5 caracteres do hash
    // Incluir maiúsculas, minúsculas e números
    const base = hash.substring(0, 8); // Mais caracteres para ter mais variação
    // Converter para mix de maiúsculas/minúsculas/números
    let result = '';
    for (let i = 0; i < 5; i++) {
        const char = base[i];
        if (i % 3 === 0) {
            result += char.toUpperCase();
        }
        else if (i % 3 === 1) {
            result += char.toLowerCase();
        }
        else {
            // Converter para número se possível, senão manter letra
            const num = parseInt(char, 16) % 10;
            result += num.toString();
        }
    }
    return result;
};
// Função para gerar URL completa do webhook
const generateWebhookUrl = (hash) => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    return `${baseUrl}/api/waha/webhook/${hash}`;
};
// Função para garantir que a coluna webhook_hash existe
const ensureWebhookHashColumn = async (client) => {
    try {
        // Verificar se a coluna webhook_hash existe
        const columnExists = await client `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'waha_config' 
      AND column_name = 'webhook_hash'
    `;
        if (columnExists.length === 0) {
            console.log('[WAHA Config] Adicionando coluna webhook_hash à tabela waha_config...');
            // Adicionar a coluna webhook_hash
            await client `
        ALTER TABLE waha_config 
        ADD COLUMN IF NOT EXISTS webhook_hash VARCHAR(10) UNIQUE
      `;
            console.log('[WAHA Config] ✅ Coluna webhook_hash adicionada com sucesso');
        }
    }
    catch (error) {
        console.error('[WAHA Config] Erro ao verificar/adicionar coluna webhook_hash:', error);
        // Não relançar o erro para não quebrar a aplicação
    }
};
// Buscar configuração WAHA
const getWahaConfig = async (req, res) => {
    const client = getClient();
    try {
        // Primeiro, verificar se a coluna webhook_hash existe
        await ensureWebhookHashColumn(client);
        const result = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (result.length === 0) {
            // Gerar hash para sessão padrão
            const defaultSessionName = 'numero-principal';
            const webhookHash = await generateWebhookHash(defaultSessionName);
            const webhookUrl = generateWebhookUrl(webhookHash);
            return res.json({
                success: true,
                data: {
                    waha_url: 'https://whatsapp-waha-whatsapp.ie5w7f.easypanel.host',
                    api_key: '',
                    webhook_url: webhookUrl,
                    webhook_hash: webhookHash,
                    session_name: defaultSessionName,
                    enabled: false
                }
            });
        }
        const config = result[0];
        // Se não tem webhook_hash, gerar um
        if (!config.webhook_hash) {
            const webhookHash = await generateWebhookHash(config.session_name);
            const webhookUrl = generateWebhookUrl(webhookHash);
            // Atualizar no banco
            await client `
        UPDATE waha_config 
        SET webhook_hash = ${webhookHash}, webhook_url = ${webhookUrl}
        WHERE id = ${config.id}
      `;
            config.webhook_hash = webhookHash;
            config.webhook_url = webhookUrl;
        }
        res.json({
            success: true,
            data: config
        });
    }
    catch (error) {
        console.error('Erro ao buscar configuração WAHA:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.getWahaConfig = getWahaConfig;
// Atualizar configuração WAHA
const updateWahaConfig = async (req, res) => {
    var _a;
    const client = getClient();
    try {
        // Garantir que a coluna webhook_hash existe
        await ensureWebhookHashColumn(client);
        const { waha_url, api_key, webhook_url, session_name, enabled, regenerate_webhook_hash } = req.body;
        // Validação básica
        if (!waha_url) {
            return res.status(400).json({
                success: false,
                message: 'URL do WAHA é obrigatória'
            });
        }
        // Verificar se existe configuração
        const existing = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        let webhookHash = (_a = existing[0]) === null || _a === void 0 ? void 0 : _a.webhook_hash;
        let finalWebhookUrl = webhook_url;
        // Se deve regenerar o hash ou não existe, gerar novo
        if (regenerate_webhook_hash || !webhookHash) {
            webhookHash = await generateWebhookHash(session_name || 'numero-principal');
            finalWebhookUrl = generateWebhookUrl(webhookHash);
        }
        let result;
        if (existing.length > 0) {
            // Atualizar configuração existente
            result = await client `
        UPDATE waha_config 
        SET 
          waha_url = ${waha_url},
          api_key = ${api_key || null},
          webhook_url = ${finalWebhookUrl},
          webhook_hash = ${webhookHash},
          session_name = ${session_name || 'numero-principal'},
          enabled = ${enabled || false},
          updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING *
      `;
        }
        else {
            // Criar nova configuração
            result = await client `
        INSERT INTO waha_config (
          waha_url, api_key, webhook_url, webhook_hash, session_name, enabled
        ) VALUES (
          ${waha_url}, ${api_key || null}, ${finalWebhookUrl}, ${webhookHash},
          ${session_name || 'numero-principal'}, ${enabled || false}
        )
        RETURNING *
      `;
        }
        res.json({
            success: true,
            message: 'Configuração WAHA atualizada com sucesso',
            data: result[0]
        });
    }
    catch (error) {
        console.error('Erro ao atualizar configuração WAHA:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.updateWahaConfig = updateWahaConfig;
// Função auxiliar para testar diferentes endpoints e métodos de autenticação
async function tryWahaEndpoint(baseUrl, path, apiKey, sessionName) {
    const url = baseUrl.endsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
    try {
        console.log(`Tentando: ${url}`);
        const response = await fetch(url, {
            method: 'GET',
            headers: apiKey ? {
                'Content-Type': 'application/json',
                'X-Api-Key': apiKey
            } : {
                'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
            const data = await response.json();
            return { success: true, data, url };
        }
        else {
            console.log(`Falha: ${response.status} ${response.statusText}`);
        }
    }
    catch (error) {
        console.log(`Erro na requisição:`, error);
    }
    return { success: false };
}
// Testar conexão com WAHA
const testWahaConnection = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        // Lista de endpoints para tentar - baseado no padrão descoberto
        const endpointsToTry = [
            `api/sessions/${wahaConfig.session_name}`, // Endpoint principal
            `api/sessions`, // Lista de sessões
            `api/health`, // Health check
            `health`,
        ];
        console.log('Testando conexão WAHA com URL base:', wahaConfig.waha_url);
        console.log('Session name:', wahaConfig.session_name);
        console.log('API Key presente:', !!wahaConfig.api_key);
        // Tentar cada endpoint
        for (const endpoint of endpointsToTry) {
            const result = await tryWahaEndpoint(wahaConfig.waha_url, endpoint, wahaConfig.api_key, wahaConfig.session_name);
            if (result.success) {
                console.log('Conexão bem-sucedida com endpoint:', result.url);
                return res.json({
                    success: true,
                    message: 'Conexão com WAHA estabelecida com sucesso',
                    data: {
                        status: 'connected',
                        endpoint: result.url,
                        response: result.data
                    }
                });
            }
        }
        // Se nenhum endpoint funcionou
        res.status(400).json({
            success: false,
            message: 'Não foi possível conectar com WAHA. Verifique a URL, API Key e nome da sessão.',
            triedEndpoints: endpointsToTry.map(e => `${wahaConfig.waha_url}/${e}`)
        });
    }
    catch (error) {
        console.error('Erro ao testar conexão WAHA:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.testWahaConnection = testWahaConnection;
// Função auxiliar para testar criação de sessão com diferentes formatos
async function tryCreateSession(url, apiKey, sessionName, webhooks = []) {
    const formats = [
        // Formato 1: Apenas nome
        { name: sessionName },
        // Formato 2: Nome com config vazia
        { name: sessionName, config: {} },
        // Formato 3: Com webhooks se fornecidos
        webhooks.length > 0 ? { name: sessionName, config: { webhooks } } : null,
        // Formato 4: Formato alternativo comum
        { sessionName },
        // Formato 5: Formato direto
        sessionName
    ].filter(Boolean);
    for (let i = 0; i < formats.length; i++) {
        const payload = formats[i];
        console.log(`Tentando formato ${i + 1}:`, JSON.stringify(payload, null, 2));
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': apiKey
                },
                body: typeof payload === 'string' ? `"${payload}"` : JSON.stringify(payload)
            });
            console.log(`Formato ${i + 1} - Status:`, response.status);
            if (response.ok) {
                const data = await response.json();
                return { success: true, data, format: i + 1 };
            }
            else if (response.status !== 422) {
                // Se não é 422, pode ser um erro diferente que vale a pena reportar
                const errorData = await response.text();
                return { success: false, status: response.status, error: errorData, format: i + 1 };
            }
        }
        catch (error) {
            console.log(`Formato ${i + 1} - Erro:`, error);
        }
    }
    return { success: false, message: 'Todos os formatos falharam' };
}
// Criar nova sessão no WAHA
const createWahaSession = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        const { sessionName, webhooks = [] } = req.body;
        if (!sessionName) {
            return res.status(400).json({
                success: false,
                message: 'Nome da sessão é obrigatório'
            });
        }
        // Criar sessão no WAHA
        const createUrl = `${wahaConfig.waha_url}/api/sessions`;
        console.log('Tentando criar sessão:', { sessionName, webhooks, createUrl });
        const result = await tryCreateSession(createUrl, wahaConfig.api_key, sessionName, webhooks);
        if (result.success) {
            res.json({
                success: true,
                message: `Sessão criada com sucesso usando formato ${result.format}`,
                data: result.data
            });
        }
        else if (result.status) {
            // Erro específico de um formato
            res.status(result.status).json({
                success: false,
                message: `Erro ao criar sessão: ${result.status}`,
                error: result.error,
                format: result.format,
                wahaResponse: {
                    status: result.status,
                    url: createUrl
                }
            });
        }
        else {
            // Todos os formatos falharam
            res.status(422).json({
                success: false,
                message: 'Não foi possível criar a sessão com nenhum formato suportado',
                error: result.message,
                url: createUrl,
                sessionName
            });
        }
    }
    catch (error) {
        console.error('Erro ao criar sessão WAHA:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.createWahaSession = createWahaSession;
// Atualizar configuração de uma sessão específica
const updateWahaSession = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        const { sessionName } = req.params;
        const { webhooks } = req.body;
        if (!sessionName) {
            return res.status(400).json({
                success: false,
                message: 'Nome da sessão é obrigatório'
            });
        }
        // Atualizar sessão no WAHA
        const updateUrl = `${wahaConfig.waha_url}/api/sessions/${sessionName}`;
        try {
            const response = await fetch(updateUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': wahaConfig.api_key
                },
                body: JSON.stringify({
                    config: {
                        webhooks: webhooks || []
                    }
                })
            });
            if (response.ok) {
                const sessionData = await response.json();
                res.json({
                    success: true,
                    message: 'Sessão atualizada com sucesso',
                    data: sessionData
                });
            }
            else {
                const errorData = await response.text();
                res.status(400).json({
                    success: false,
                    message: `Erro ao atualizar sessão: ${response.status} ${response.statusText}`,
                    error: errorData
                });
            }
        }
        catch (fetchError) {
            res.status(500).json({
                success: false,
                message: 'Não foi possível atualizar sessão no WAHA',
                error: fetchError instanceof Error ? fetchError.message : 'Erro de conexão'
            });
        }
    }
    catch (error) {
        console.error('Erro ao atualizar sessão WAHA:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.updateWahaSession = updateWahaSession;
// Iniciar sessão no WAHA
const startWahaSession = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        const { sessionName } = req.params;
        // Iniciar sessão no WAHA
        const startUrl = `${wahaConfig.waha_url}/api/sessions/${sessionName}/start`;
        try {
            const response = await fetch(startUrl, {
                method: 'POST',
                headers: {
                    'X-Api-Key': wahaConfig.api_key
                }
            });
            if (response.ok) {
                const sessionData = await response.json();
                res.json({
                    success: true,
                    message: 'Sessão iniciada com sucesso',
                    data: sessionData
                });
            }
            else {
                const errorData = await response.text();
                res.status(400).json({
                    success: false,
                    message: `Erro ao iniciar sessão: ${response.status} ${response.statusText}`,
                    error: errorData
                });
            }
        }
        catch (fetchError) {
            res.status(500).json({
                success: false,
                message: 'Não foi possível iniciar sessão no WAHA',
                error: fetchError instanceof Error ? fetchError.message : 'Erro de conexão'
            });
        }
    }
    catch (error) {
        console.error('Erro ao iniciar sessão WAHA:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.startWahaSession = startWahaSession;
// Parar sessão no WAHA
const stopWahaSession = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        const { sessionName } = req.params;
        // Parar sessão no WAHA
        const stopUrl = `${wahaConfig.waha_url}/api/sessions/${sessionName}/stop`;
        try {
            const response = await fetch(stopUrl, {
                method: 'POST',
                headers: {
                    'X-Api-Key': wahaConfig.api_key
                }
            });
            if (response.ok) {
                const sessionData = await response.json();
                res.json({
                    success: true,
                    message: 'Sessão parada com sucesso',
                    data: sessionData
                });
            }
            else {
                const errorData = await response.text();
                res.status(400).json({
                    success: false,
                    message: `Erro ao parar sessão: ${response.status} ${response.statusText}`,
                    error: errorData
                });
            }
        }
        catch (fetchError) {
            res.status(500).json({
                success: false,
                message: 'Não foi possível parar sessão no WAHA',
                error: fetchError instanceof Error ? fetchError.message : 'Erro de conexão'
            });
        }
    }
    catch (error) {
        console.error('Erro ao parar sessão WAHA:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.stopWahaSession = stopWahaSession;
// Deletar sessão no WAHA
const deleteWahaSession = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        const { sessionName } = req.params;
        // Deletar sessão no WAHA
        const deleteUrl = `${wahaConfig.waha_url}/api/sessions/${sessionName}`;
        try {
            const response = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: {
                    'X-Api-Key': wahaConfig.api_key
                }
            });
            if (response.ok) {
                res.json({
                    success: true,
                    message: 'Sessão deletada com sucesso'
                });
            }
            else {
                const errorData = await response.text();
                res.status(400).json({
                    success: false,
                    message: `Erro ao deletar sessão: ${response.status} ${response.statusText}`,
                    error: errorData
                });
            }
        }
        catch (fetchError) {
            res.status(500).json({
                success: false,
                message: 'Não foi possível deletar sessão no WAHA',
                error: fetchError instanceof Error ? fetchError.message : 'Erro de conexão'
            });
        }
    }
    catch (error) {
        console.error('Erro ao deletar sessão WAHA:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.deleteWahaSession = deleteWahaSession;
// Função para fazer requisição direta e obter informações detalhadas
async function getWahaSessionsDirect(baseUrl, apiKey) {
    var _a;
    const endpoints = [
        'api/sessions?all=true', // PRINCIPAL - Retorna todas as sessões incluindo STOPPED
        'api/sessions', // Apenas ativas
        'api/sessions/all',
        'api/v1/sessions',
        'sessions?all=true',
        'sessions',
        'api/session',
        'session',
        'api/sessions/status',
        'api/whatsapp/sessions',
        'whatsapp/sessions'
    ];
    for (const endpoint of endpoints) {
        const url = `${baseUrl}/${endpoint}`;
        console.log(`Testando endpoint direto: ${url}`);
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': apiKey
                }
            });
            console.log(`${endpoint} - Status: ${response.status}`);
            if (response.ok) {
                const text = await response.text();
                console.log(`${endpoint} - Resposta RAW: ${text}`);
                try {
                    const data = JSON.parse(text);
                    console.log(`${endpoint} - Dados JSON parseados:`, JSON.stringify(data, null, 2));
                    // Log específico das sessões encontradas
                    if (Array.isArray(data)) {
                        console.log(`📋 SESSÕES ENCONTRADAS (${data.length}):`);
                        data.forEach((session, index) => {
                            var _a;
                            console.log(`  ${index + 1}. Nome: ${session.name || session.sessionName || 'N/A'}`);
                            console.log(`     Status: ${session.status || 'N/A'}`);
                            console.log(`     Conectado: ${((_a = session.me) === null || _a === void 0 ? void 0 : _a.id) || 'Não conectado'}`);
                            console.log(`     Engine: ${session.engine || 'N/A'}`);
                            console.log('     ---');
                        });
                    }
                    else if (data && typeof data === 'object') {
                        if (data.sessions && Array.isArray(data.sessions)) {
                            console.log(`📋 SESSÕES ENCONTRADAS EM data.sessions (${data.sessions.length}):`);
                            data.sessions.forEach((session, index) => {
                                var _a;
                                console.log(`  ${index + 1}. Nome: ${session.name || session.sessionName || 'N/A'}`);
                                console.log(`     Status: ${session.status || 'N/A'}`);
                                console.log(`     Conectado: ${((_a = session.me) === null || _a === void 0 ? void 0 : _a.id) || 'Não conectado'}`);
                                console.log(`     Engine: ${session.engine || 'N/A'}`);
                                console.log('     ---');
                            });
                        }
                        else {
                            console.log(`📋 SESSÃO ÚNICA ENCONTRADA:`);
                            console.log(`  Nome: ${data.name || data.sessionName || 'N/A'}`);
                            console.log(`  Status: ${data.status || 'N/A'}`);
                            console.log(`  Conectado: ${((_a = data.me) === null || _a === void 0 ? void 0 : _a.id) || 'Não conectado'}`);
                            console.log(`  Engine: ${data.engine || 'N/A'}`);
                        }
                    }
                    return {
                        success: true,
                        data,
                        endpoint: url,
                        rawResponse: text
                    };
                }
                catch (e) {
                    console.log(`${endpoint} - Erro ao parsear JSON:`, e);
                    console.log(`${endpoint} - Resposta não é JSON válido: ${text}`);
                }
            }
        }
        catch (error) {
            console.log(`${endpoint} - Erro na requisição:`, error);
        }
    }
    return { success: false };
}
// Listar sessões ativas no WAHA
const getWahaSessions = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        console.log('Buscando todas as sessões WAHA (incluindo STOPPED)...');
        // Primeiro tentar o endpoint correto que inclui sessões paradas
        const mainEndpoint = 'api/sessions?all=true';
        console.log(`🎯 Tentando endpoint principal: ${wahaConfig.waha_url}/${mainEndpoint}`);
        try {
            const response = await fetch(`${wahaConfig.waha_url}/${mainEndpoint}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': wahaConfig.api_key
                }
            });
            if (response.ok) {
                const sessionsData = await response.json();
                console.log('✅ Sessões encontradas no endpoint principal!');
                console.log('Dados recebidos:', JSON.stringify(sessionsData, null, 2));
                // Processar as sessões
                let sessions = Array.isArray(sessionsData) ? sessionsData : [sessionsData];
                console.log(`📊 Total de sessões encontradas: ${sessions.length}`);
                sessions.forEach((session, index) => {
                    var _a, _b;
                    console.log(`  ${index + 1}. Nome: ${session.name}`);
                    console.log(`     Status: ${session.status}`);
                    console.log(`     Conectado: ${((_a = session.me) === null || _a === void 0 ? void 0 : _a.id) || 'Não conectado'}`);
                    console.log(`     Engine: ${((_b = session.engine) === null || _b === void 0 ? void 0 : _b.engine) || 'N/A'}`);
                    console.log('     ---');
                });
                return res.json({
                    success: true,
                    data: sessions,
                    endpoint: `${wahaConfig.waha_url}/${mainEndpoint}`,
                    total: sessions.length,
                    debug: {
                        method: 'direct_endpoint',
                        originalType: Array.isArray(sessionsData) ? 'array' : typeof sessionsData,
                        processedCount: sessions.length
                    }
                });
            }
        }
        catch (error) {
            console.log('❌ Endpoint principal falhou, tentando alternativas...');
        }
        // Se o endpoint principal falhar, usar a função de fallback
        const result = await getWahaSessionsDirect(wahaConfig.waha_url, wahaConfig.api_key);
        if (result.success) {
            console.log('✅ Sessões encontradas!');
            console.log('Endpoint usado:', result.endpoint);
            console.log('Dados brutos:', result.rawResponse);
            // Processar os dados para garantir que seja um array
            let sessions = result.data;
            // Verificar diferentes estruturas de resposta
            if (!Array.isArray(sessions)) {
                if (sessions.sessions && Array.isArray(sessions.sessions)) {
                    sessions = sessions.sessions;
                }
                else if (sessions.data && Array.isArray(sessions.data)) {
                    sessions = sessions.data;
                }
                else if (sessions.results && Array.isArray(sessions.results)) {
                    sessions = sessions.results;
                }
                else if (typeof sessions === 'object') {
                    // Se é um objeto, pode ser uma única sessão
                    sessions = [sessions];
                }
                else {
                    sessions = [];
                }
            }
            return res.json({
                success: true,
                data: sessions,
                endpoint: result.endpoint,
                total: sessions.length,
                rawData: result.data,
                debug: {
                    originalType: Array.isArray(result.data) ? 'array' : typeof result.data,
                    processedCount: sessions.length
                }
            });
        }
        // Se nenhum endpoint funcionou
        console.log('❌ Nenhum endpoint funcionou para buscar sessões');
        res.status(400).json({
            success: false,
            message: 'Não foi possível buscar sessões do WAHA. Verifique se a API está configurada corretamente.',
            config: {
                url: wahaConfig.waha_url,
                hasApiKey: !!wahaConfig.api_key,
                sessionName: wahaConfig.session_name
            }
        });
    }
    catch (error) {
        console.error('Erro ao buscar sessões WAHA:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.getWahaSessions = getWahaSessions;
// Obter QR Code para pareamento de sessão
const getSessionQRCode = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        const { sessionName } = req.params;
        if (!sessionName) {
            return res.status(400).json({
                success: false,
                message: 'Nome da sessão é obrigatório'
            });
        }
        console.log('🔍 === TENTANDO OBTER QR CODE ===');
        console.log('Sessão:', sessionName);
        console.log('URL Base:', wahaConfig.waha_url);
        // O endpoint correto é /api/{session}/auth/qr conforme documentação da API
        const qrUrl = `${wahaConfig.waha_url}/api/${sessionName}/auth/qr`;
        console.log(`🎯 Usando endpoint correto: ${qrUrl}`);
        try {
            const response = await fetch(qrUrl, {
                method: 'GET',
                headers: {
                    'X-Api-Key': wahaConfig.api_key
                }
            });
            console.log(`Status da resposta: ${response.status}`);
            if (response.ok) {
                // Verificar se é uma imagem (QR Code)
                const contentType = response.headers.get('content-type');
                console.log(`Content-Type: ${contentType}`);
                if (contentType && contentType.includes('image')) {
                    // Converter para base64 para enviar ao frontend
                    const buffer = await response.arrayBuffer();
                    const base64 = Buffer.from(buffer).toString('base64');
                    const dataUri = `data:${contentType};base64,${base64}`;
                    console.log('✅ QR Code obtido como imagem!');
                    return res.json({
                        success: true,
                        data: {
                            qr: dataUri,
                            type: 'image',
                            contentType: contentType
                        },
                        endpoint: `api/${sessionName}/auth/qr`,
                        url: qrUrl
                    });
                }
                else {
                    // Tentar como JSON (caso retorne dados em formato diferente)
                    const textData = await response.text();
                    try {
                        const jsonData = JSON.parse(textData);
                        console.log('✅ QR Code obtido como JSON!');
                        return res.json({
                            success: true,
                            data: jsonData,
                            endpoint: `api/${sessionName}/auth/qr`,
                            url: qrUrl
                        });
                    }
                    catch (e) {
                        console.log('Resposta não é JSON nem imagem válida');
                        return res.json({
                            success: true,
                            data: {
                                text: textData,
                                type: 'text'
                            },
                            endpoint: `api/${sessionName}/auth/qr`,
                            url: qrUrl
                        });
                    }
                }
            }
            else {
                const errorData = await response.text();
                console.log(`❌ Erro no endpoint principal: ${response.status} - ${errorData}`);
            }
        }
        catch (fetchError) {
            console.log(`💥 Erro na requisição principal: ${fetchError}`);
        }
        // Se o endpoint principal falhar, tentar endpoints alternativos como fallback
        console.log('Tentando endpoints alternativos...');
        const qrEndpoints = [
            `api/sessions/${sessionName}/auth/qr`, // Formato alternativo com sessions/
            `api/sessions/${sessionName}/qr`, // Sem auth/
            `api/${sessionName}/qr`, // Sem auth/ e sem sessions/
            `api/v1/${sessionName}/auth/qr`, // Com versão v1
            `api/v1/${sessionName}/qr` // Com versão v1 sem auth/
        ];
        for (const endpoint of qrEndpoints) {
            const qrUrl = `${wahaConfig.waha_url}/${endpoint}`;
            console.log(`\n🔍 Testando endpoint: ${endpoint}`);
            console.log(`   URL completa: ${qrUrl}`);
            try {
                const response = await fetch(qrUrl, {
                    method: 'GET',
                    headers: {
                        'X-Api-Key': wahaConfig.api_key
                    }
                });
                console.log(`   Status: ${response.status}`);
                if (response.ok) {
                    const qrData = await response.json();
                    console.log(`   ✅ Sucesso! QR Code obtido via ${endpoint}`);
                    return res.json({
                        success: true,
                        data: qrData,
                        endpoint: endpoint,
                        url: qrUrl
                    });
                }
                else {
                    const errorData = await response.text();
                    console.log(`   ❌ Falhou: ${response.status} - ${errorData.substring(0, 100)}`);
                    // Se for 404, continuar tentando outros endpoints
                    if (response.status === 404) {
                        continue;
                    }
                    // Para outros erros, retornar o erro específico
                    return res.status(response.status).json({
                        success: false,
                        message: `Erro ao obter QR Code via ${endpoint}: ${response.status} ${response.statusText}`,
                        error: errorData,
                        endpoint: endpoint,
                        url: qrUrl
                    });
                }
            }
            catch (fetchError) {
                console.log(`   💥 Erro na requisição: ${fetchError}`);
                // Continuar tentando outros endpoints
                continue;
            }
        }
        // Se nenhum endpoint funcionou
        console.log('❌ Nenhum endpoint de QR Code funcionou');
        // Tentar obter informações da sessão para debug
        try {
            const sessionUrl = `${wahaConfig.waha_url}/api/sessions/${sessionName}`;
            console.log(`\n🔍 Tentando obter informações da sessão para debug: ${sessionUrl}`);
            const sessionResponse = await fetch(sessionUrl, {
                method: 'GET',
                headers: {
                    'X-Api-Key': wahaConfig.api_key
                }
            });
            if (sessionResponse.ok) {
                const sessionData = await sessionResponse.json();
                console.log('📊 Informações da sessão:', JSON.stringify(sessionData, null, 2));
                return res.status(404).json({
                    success: false,
                    message: 'QR Code não disponível - nenhum endpoint funcionou',
                    error: 'Todos os endpoints de QR Code retornaram erro',
                    sessionInfo: sessionData,
                    testedEndpoints: qrEndpoints,
                    suggestion: 'Verifique se a sessão está no estado correto para gerar QR Code'
                });
            }
        }
        catch (sessionError) {
            console.log('❌ Não foi possível obter informações da sessão para debug');
        }
        // Resposta final se nada funcionou
        res.status(404).json({
            success: false,
            message: 'QR Code não disponível - nenhum endpoint funcionou',
            error: 'Todos os endpoints de QR Code retornaram erro',
            testedEndpoints: qrEndpoints,
            suggestion: 'Verifique se a sessão está iniciada e no estado correto para gerar QR Code'
        });
    }
    catch (error) {
        console.error('Erro ao obter QR Code:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.getSessionQRCode = getSessionQRCode;
// Enviar código de pareamento para sessão
const sendPairingCode = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        const { sessionName } = req.params;
        const { phoneNumber } = req.body;
        if (!sessionName) {
            return res.status(400).json({
                success: false,
                message: 'Nome da sessão é obrigatório'
            });
        }
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Número de telefone é obrigatório'
            });
        }
        // Enviar código de pareamento via WAHA
        const pairingUrl = `${wahaConfig.waha_url}/api/sessions/${sessionName}/auth/request-code`;
        try {
            const response = await fetch(pairingUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': wahaConfig.api_key
                },
                body: JSON.stringify({
                    phoneNumber: phoneNumber.replace(/\D/g, '') // Remove caracteres não numéricos
                })
            });
            if (response.ok) {
                const codeData = await response.json();
                res.json({
                    success: true,
                    message: 'Código de pareamento enviado',
                    data: codeData
                });
            }
            else {
                const errorData = await response.text();
                res.status(response.status).json({
                    success: false,
                    message: `Erro ao enviar código: ${response.status} ${response.statusText}`,
                    error: errorData
                });
            }
        }
        catch (fetchError) {
            res.status(500).json({
                success: false,
                message: 'Não foi possível enviar código de pareamento',
                error: fetchError instanceof Error ? fetchError.message : 'Erro de conexão'
            });
        }
    }
    catch (error) {
        console.error('Erro ao enviar código de pareamento:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.sendPairingCode = sendPairingCode;
// Confirmar código de pareamento
const confirmPairingCode = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        const { sessionName } = req.params;
        const { code } = req.body;
        if (!sessionName) {
            return res.status(400).json({
                success: false,
                message: 'Nome da sessão é obrigatório'
            });
        }
        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Código de pareamento é obrigatório'
            });
        }
        // Confirmar código de pareamento via WAHA
        const confirmUrl = `${wahaConfig.waha_url}/api/sessions/${sessionName}/auth/authorize-code`;
        try {
            const response = await fetch(confirmUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': wahaConfig.api_key
                },
                body: JSON.stringify({
                    code: code.replace(/\s/g, '') // Remove espaços
                })
            });
            if (response.ok) {
                const confirmData = await response.json();
                res.json({
                    success: true,
                    message: 'Pareamento confirmado com sucesso',
                    data: confirmData
                });
            }
            else {
                const errorData = await response.text();
                res.status(response.status).json({
                    success: false,
                    message: `Erro ao confirmar código: ${response.status} ${response.statusText}`,
                    error: errorData
                });
            }
        }
        catch (fetchError) {
            res.status(500).json({
                success: false,
                message: 'Não foi possível confirmar código de pareamento',
                error: fetchError instanceof Error ? fetchError.message : 'Erro de conexão'
            });
        }
    }
    catch (error) {
        console.error('Erro ao confirmar código de pareamento:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.confirmPairingCode = confirmPairingCode;
// Endpoint de debug para testar diretamente todos os endpoints possíveis
const debugWahaEndpoints = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        console.log('🔍 === DEBUG WAHA ENDPOINTS ===');
        console.log('URL Base:', wahaConfig.waha_url);
        console.log('API Key presente:', !!wahaConfig.api_key);
        const allEndpoints = [
            'api/sessions?all=true', // PRINCIPAL - Inclui sessões STOPPED
            'api/sessions', // Apenas ativas
            'api/sessions/all',
            'api/sessions/list',
            'api/v1/sessions',
            'sessions?all=true', // Alternativo com parâmetro
            'sessions',
            'sessions/all',
            'api/session',
            'session',
            'api/sessions/status',
            'api/whatsapp/sessions',
            'whatsapp/sessions',
            'api/waha/sessions',
            'waha/sessions'
        ];
        // Endpoints específicos para QR Code (testar com uma sessão existente)
        const qrEndpoints = [
            'api/test-session/auth/qr', // Endpoint correto conforme documentação
            'api/sessions/test-session/auth/qr', // Formato alternativo
            'api/sessions/test-session/qr', // Sem auth/
            'api/test-session/qr', // Sem auth/ e sem sessions/
            'api/v1/test-session/auth/qr', // Com versão v1
            'api/sessions/test-session/status' // Status da sessão
        ];
        const results = [];
        // Testar endpoints de sessões
        for (const endpoint of allEndpoints) {
            const url = `${wahaConfig.waha_url}/${endpoint}`;
            console.log(`\n🔍 Testando: ${endpoint}`);
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Api-Key': wahaConfig.api_key
                    }
                });
                console.log(`   Status: ${response.status}`);
                if (response.ok) {
                    const text = await response.text();
                    console.log(`   ✅ Sucesso! Resposta: ${text.substring(0, 200)}...`);
                    try {
                        const data = JSON.parse(text);
                        results.push({
                            endpoint,
                            url,
                            status: response.status,
                            success: true,
                            data,
                            type: Array.isArray(data) ? 'array' : typeof data,
                            count: Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : 1)
                        });
                    }
                    catch (e) {
                        results.push({
                            endpoint,
                            url,
                            status: response.status,
                            success: true,
                            rawText: text,
                            parseError: 'Não é JSON válido'
                        });
                    }
                }
                else {
                    const errorText = await response.text();
                    console.log(`   ❌ Falhou: ${response.status} - ${errorText.substring(0, 100)}`);
                    results.push({
                        endpoint,
                        url,
                        status: response.status,
                        success: false,
                        error: errorText
                    });
                }
            }
            catch (fetchError) {
                console.log(`   💥 Erro na requisição: ${fetchError}`);
                results.push({
                    endpoint,
                    url,
                    success: false,
                    error: fetchError instanceof Error ? fetchError.message : 'Erro desconhecido'
                });
            }
        }
        // Testar endpoints de QR Code
        console.log('\n🔍 === TESTANDO ENDPOINTS DE QR CODE ===');
        const qrResults = [];
        for (const endpoint of qrEndpoints) {
            const url = `${wahaConfig.waha_url}/${endpoint}`;
            console.log(`\n🔍 Testando QR endpoint: ${endpoint}`);
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'X-Api-Key': wahaConfig.api_key
                    }
                });
                console.log(`   Status: ${response.status}`);
                if (response.ok) {
                    const text = await response.text();
                    console.log(`   ✅ Sucesso! Resposta: ${text.substring(0, 200)}...`);
                    try {
                        const data = JSON.parse(text);
                        qrResults.push({
                            endpoint,
                            url,
                            status: response.status,
                            success: true,
                            data,
                            type: typeof data
                        });
                    }
                    catch (e) {
                        qrResults.push({
                            endpoint,
                            url,
                            status: response.status,
                            success: true,
                            rawText: text,
                            parseError: 'Não é JSON válido'
                        });
                    }
                }
                else {
                    const errorText = await response.text();
                    console.log(`   ❌ Falhou: ${response.status} - ${errorText.substring(0, 100)}`);
                    qrResults.push({
                        endpoint,
                        url,
                        status: response.status,
                        success: false,
                        error: errorText
                    });
                }
            }
            catch (fetchError) {
                console.log(`   💥 Erro na requisição: ${fetchError}`);
                qrResults.push({
                    endpoint,
                    url,
                    success: false,
                    error: fetchError instanceof Error ? fetchError.message : 'Erro desconhecido'
                });
            }
        }
        console.log('\n📊 === RESUMO DOS TESTES ===');
        const successful = results.filter(r => r.success);
        const successfulQR = qrResults.filter(r => r.success);
        console.log(`✅ Sessões - Sucessos: ${successful.length}/${results.length}`);
        console.log(`✅ QR Code - Sucessos: ${successfulQR.length}/${qrResults.length}`);
        successful.forEach(result => {
            console.log(`   ${result.endpoint}: ${result.type} com ${result.count} item(s)`);
        });
        if (successfulQR.length > 0) {
            console.log('\n🎯 Endpoints de QR Code funcionais:');
            successfulQR.forEach(result => {
                console.log(`   ${result.endpoint}: ${result.type}`);
            });
        }
        res.json({
            success: true,
            message: `Testados ${allEndpoints.length} endpoints de sessões e ${qrEndpoints.length} endpoints de QR Code`,
            config: {
                url: wahaConfig.waha_url,
                hasApiKey: !!wahaConfig.api_key
            },
            results: {
                sessions: results,
                qrCode: qrResults
            },
            summary: {
                sessions: {
                    total: results.length,
                    successful: successful.length,
                    failed: results.length - successful.length
                },
                qrCode: {
                    total: qrResults.length,
                    successful: successfulQR.length,
                    failed: qrResults.length - successfulQR.length
                }
            }
        });
    }
    catch (error) {
        console.error('Erro no debug:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.debugWahaEndpoints = debugWahaEndpoints;
// Testar endpoints de QR Code com sessões reais
const testQRCodeEndpoints = async (req, res) => {
    const client = getClient();
    try {
        // Buscar configuração atual
        const config = await client `
      SELECT * FROM waha_config 
      ORDER BY id DESC 
      LIMIT 1
    `;
        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração WAHA não encontrada'
            });
        }
        const wahaConfig = config[0];
        console.log('🔍 === TESTE ESPECÍFICO DE QR CODE ===');
        console.log('URL Base:', wahaConfig.waha_url);
        // Primeiro, obter lista de sessões existentes
        const sessionsUrl = `${wahaConfig.waha_url}/api/sessions?all=true`;
        let existingSessions = [];
        try {
            const sessionsResponse = await fetch(sessionsUrl, {
                method: 'GET',
                headers: {
                    'X-Api-Key': wahaConfig.api_key
                }
            });
            if (sessionsResponse.ok) {
                const sessionsData = await sessionsResponse.json();
                existingSessions = Array.isArray(sessionsData) ? sessionsData : [sessionsData];
                console.log(`📊 Sessões encontradas: ${existingSessions.length}`);
                existingSessions.forEach((session, index) => {
                    console.log(`  ${index + 1}. ${session.name} - Status: ${session.status}`);
                });
            }
        }
        catch (error) {
            console.log('❌ Erro ao buscar sessões:', error);
        }
        // Se não houver sessões, criar uma de teste
        if (existingSessions.length === 0) {
            console.log('📝 Criando sessão de teste...');
            try {
                const createUrl = `${wahaConfig.waha_url}/api/sessions`;
                const createResponse = await fetch(createUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Api-Key': wahaConfig.api_key
                    },
                    body: JSON.stringify({
                        name: 'test-qr-session',
                        webhooks: []
                    })
                });
                if (createResponse.ok) {
                    const createData = await createResponse.json();
                    console.log('✅ Sessão de teste criada:', createData);
                    existingSessions = [{ name: 'test-qr-session', status: 'STOPPED' }];
                }
            }
            catch (error) {
                console.log('❌ Erro ao criar sessão de teste:', error);
            }
        }
        // Testar endpoints de QR Code para cada sessão
        const qrTestResults = [];
        for (const session of existingSessions) {
            const sessionName = session.name;
            console.log(`\n🔍 Testando QR Code para sessão: ${sessionName}`);
            // Lista de endpoints para testar (com o correto primeiro)
            const qrEndpoints = [
                `api/${sessionName}/auth/qr`, // Endpoint correto conforme documentação
                `api/sessions/${sessionName}/auth/qr`, // Formato alternativo
                `api/sessions/${sessionName}/qr`, // Sem auth/
                `api/${sessionName}/qr`, // Sem auth/ e sem sessions/
                `api/v1/${sessionName}/auth/qr`, // Com versão v1
                `api/sessions/${sessionName}/status` // Status da sessão
            ];
            const sessionResults = [];
            for (const endpoint of qrEndpoints) {
                const qrUrl = `${wahaConfig.waha_url}/${endpoint}`;
                console.log(`   Testando: ${endpoint}`);
                try {
                    const response = await fetch(qrUrl, {
                        method: 'GET',
                        headers: {
                            'X-Api-Key': wahaConfig.api_key
                        }
                    });
                    const result = {
                        endpoint,
                        url: qrUrl,
                        status: response.status,
                        success: response.ok,
                        sessionName
                    };
                    if (response.ok) {
                        try {
                            const data = await response.json();
                            result.data = data;
                            console.log(`     ✅ Sucesso!`);
                        }
                        catch (e) {
                            const text = await response.text();
                            result.rawText = text;
                            console.log(`     ✅ Sucesso (não-JSON): ${text.substring(0, 100)}`);
                        }
                    }
                    else {
                        const errorText = await response.text();
                        result.error = errorText;
                        console.log(`     ❌ Falhou: ${response.status}`);
                    }
                    sessionResults.push(result);
                }
                catch (fetchError) {
                    const result = {
                        endpoint,
                        url: qrUrl,
                        success: false,
                        error: fetchError instanceof Error ? fetchError.message : 'Erro de conexão',
                        sessionName
                    };
                    sessionResults.push(result);
                    console.log(`     💥 Erro: ${result.error}`);
                }
            }
            qrTestResults.push({
                sessionName,
                sessionStatus: session.status,
                results: sessionResults
            });
        }
        res.json({
            success: true,
            message: `Testados endpoints de QR Code para ${existingSessions.length} sessão(ões)`,
            config: {
                url: wahaConfig.waha_url,
                hasApiKey: !!wahaConfig.api_key
            },
            sessions: existingSessions,
            qrTestResults,
            summary: {
                totalSessions: existingSessions.length,
                totalEndpoints: 6, // Número fixo de endpoints testados
                successfulEndpoints: qrTestResults.reduce((acc, session) => acc + session.results.filter(r => r.success).length, 0)
            }
        });
    }
    catch (error) {
        console.error('Erro no teste de QR Code:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.testQRCodeEndpoints = testQRCodeEndpoints;
