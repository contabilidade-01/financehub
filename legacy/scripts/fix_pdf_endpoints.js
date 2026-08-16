import fs from 'fs';

// Ler o arquivo swagger.json atual
const swaggerContent = fs.readFileSync('swagger.json', 'utf8');
const swagger = JSON.parse(swaggerContent);

// Remover endpoints incorretos se existirem
delete swagger.paths['/reports/pdf'];
delete swagger.paths['/reports/download/{filename}'];

// Adicionar os endpoints corretos com prefixo /api
swagger.paths['/api/reports/pdf'] = {
  "get": {
    "summary": "Gera PDF do relatório financeiro",
    "description": "Cria um PDF com os dados financeiros formatados igual à página de relatórios",
    "tags": ["Relatórios"],
    "security": [
      {"cookieAuth": []},
      {"apiKeyAuth": []}
    ],
    "responses": {
      "200": {
        "description": "URL do PDF gerado com sucesso",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "success": {
                  "type": "boolean",
                  "description": "Status da operação"
                },
                "downloadUrl": {
                  "type": "string",
                  "description": "URL para download do PDF"
                },
                "filename": {
                  "type": "string",
                  "description": "Nome do arquivo PDF"
                }
              },
              "example": {
                "success": true,
                "downloadUrl": "/api/reports/download/relatorio-financeiro-2024-05-27.pdf",
                "filename": "relatorio-financeiro-2024-05-27.pdf"
              }
            }
          }
        }
      },
      "401": {
        "description": "Não autenticado"
      },
      "404": {
        "description": "Carteira não encontrada"
      },
      "500": {
        "description": "Erro ao gerar PDF"
      }
    }
  }
};

swagger.paths['/api/reports/download/{filename}'] = {
  "get": {
    "summary": "Download do arquivo PDF do relatório",
    "description": "Faz o download do arquivo PDF gerado",
    "tags": ["Relatórios"],
    "parameters": [
      {
        "in": "path",
        "name": "filename",
        "schema": {
          "type": "string"
        },
        "required": true,
        "description": "Nome do arquivo PDF para download"
      }
    ],
    "responses": {
      "200": {
        "description": "Arquivo PDF",
        "content": {
          "application/pdf": {
            "schema": {
              "type": "string",
              "format": "binary"
            }
          }
        }
      },
      "404": {
        "description": "Arquivo não encontrado"
      }
    }
  }
};

// Salvar o arquivo atualizado
fs.writeFileSync('swagger.json', JSON.stringify(swagger, null, 2));
console.log('✅ Endpoints de PDF corrigidos no swagger.json com prefixo /api!');