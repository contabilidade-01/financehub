import fs from 'fs';

// Ler o arquivo swagger.json atual
const swaggerContent = fs.readFileSync('swagger.json', 'utf8');
const swagger = JSON.parse(swaggerContent);

// Adicionar tag para Dashboard se não existir
if (!swagger.tags.find(tag => tag.name === 'Dashboard')) {
  swagger.tags.push({
    name: 'Dashboard',
    description: 'Endpoints para relatórios e resumos financeiros'
  });
}

// Definir o endpoint de dashboard summary
const dashboardSummaryEndpoint = {
  "get": {
    "summary": "Obtém resumo financeiro do dashboard",
    "description": "Retorna dados consolidados incluindo resumo mensal, gastos por categoria e totais de receitas/despesas",
    "tags": ["Dashboard"],
    "security": [
      {"cookieAuth": []},
      {"apiKeyAuth": []}
    ],
    "responses": {
      "200": {
        "description": "Resumo financeiro obtido com sucesso",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "monthlyData": {
                  "type": "array",
                  "description": "Dados mensais de receitas e despesas",
                  "items": {
                    "type": "object",
                    "properties": {
                      "month": {
                        "type": "string",
                        "description": "Nome do mês"
                      },
                      "income": {
                        "type": "number",
                        "format": "decimal",
                        "description": "Total de receitas do mês"
                      },
                      "expense": {
                        "type": "number",
                        "format": "decimal",
                        "description": "Total de despesas do mês"
                      }
                    }
                  }
                },
                "expensesByCategory": {
                  "type": "array",
                  "description": "Gastos agrupados por categoria",
                  "items": {
                    "type": "object",
                    "properties": {
                      "categoryId": {
                        "type": "integer",
                        "description": "ID da categoria"
                      },
                      "name": {
                        "type": "string",
                        "description": "Nome da categoria"
                      },
                      "total": {
                        "type": "number",
                        "format": "decimal",
                        "description": "Total gasto na categoria"
                      },
                      "color": {
                        "type": "string",
                        "description": "Código de cor hexadecimal da categoria"
                      },
                      "icon": {
                        "type": "string",
                        "description": "Nome do ícone da categoria"
                      },
                      "percentage": {
                        "type": "integer",
                        "description": "Percentual do total de gastos"
                      }
                    }
                  }
                },
                "totalIncome": {
                  "type": "number",
                  "format": "decimal",
                  "description": "Total geral de receitas"
                },
                "totalExpenses": {
                  "type": "number",
                  "format": "decimal",
                  "description": "Total geral de despesas"
                }
              },
              "example": {
                "monthlyData": [
                  {
                    "month": "Jan",
                    "income": 3000.00,
                    "expense": 1500.00
                  },
                  {
                    "month": "Feb", 
                    "income": 3200.00,
                    "expense": 1800.00
                  }
                ],
                "expensesByCategory": [
                  {
                    "categoryId": 1,
                    "name": "Alimentação",
                    "total": 450.00,
                    "color": "#FF5722",
                    "icon": "food",
                    "percentage": 30
                  }
                ],
                "totalIncome": 6200.00,
                "totalExpenses": 3300.00
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
        "description": "Erro interno do servidor"
      }
    }
  }
};

// Adicionar o endpoint ao paths
swagger.paths['/dashboard/summary'] = dashboardSummaryEndpoint;

// Salvar o arquivo atualizado
fs.writeFileSync('swagger.json', JSON.stringify(swagger, null, 2));
console.log('✅ Endpoint /dashboard/summary adicionado ao swagger.json com sucesso!');