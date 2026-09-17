"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiGuide = getApiGuide;
/**
 * Controlador para fornecer informações sobre o uso da API
 */
function getApiGuide(req, res) {
    const guideData = {
        titulo: "Guia de Integração da API de Controle Financeiro",
        descricao: "Esta documentação fornece instruções sobre como integrar com nossa API usando tokens de acesso.",
        autenticacao: {
            metodo: "API Key",
            header: "apikey",
            formato: "Token gerado na interface de usuário (ex: fin_a8cd860385eaf6b2d74be8a4e3c72f9b1d61cd)"
        },
        endpoints: [
            {
                rota: "/api/transactions",
                metodo: "GET",
                descricao: "Lista todas as transações do usuário",
                parametros: "Nenhum"
            },
            {
                rota: "/api/transactions",
                metodo: "POST",
                descricao: "Cria uma nova transação",
                parametros: "descricao, valor, tipo, categoria_id, data"
            },
            {
                rota: "/api/categories",
                metodo: "GET",
                descricao: "Lista todas as categorias do usuário",
                parametros: "Nenhum"
            },
            {
                rota: "/api/dashboard/summary",
                metodo: "GET",
                descricao: "Obtém resumo do dashboard",
                parametros: "Nenhum"
            }
        ],
        exemplos: {
            curl: 'curl -X GET https://sua-aplicacao.com/api/transactions -H "apikey: seu_token_aqui"',
            javascript: `
fetch('https://sua-aplicacao.com/api/transactions', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'apikey': 'seu_token_aqui'
  }
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Erro:', error));`,
            python: `
import requests

headers = {
    'Content-Type': 'application/json',
    'apikey': 'seu_token_aqui'
}

response = requests.get('https://sua-aplicacao.com/api/transactions', headers=headers)
data = response.json()
print(data)`
        },
        codigosErro: [
            { codigo: 401, descricao: "Token ausente ou inválido" },
            { codigo: 403, descricao: "Token sem permissão para acessar o recurso" },
            { codigo: 404, descricao: "Recurso não encontrado" },
            { codigo: 422, descricao: "Erro de validação nos dados enviados" },
            { codigo: 500, descricao: "Erro interno do servidor" }
        ]
    };
    return res.status(200).json(guideData);
}
