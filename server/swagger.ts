import swaggerUi from 'swagger-ui-express';
import { Express, Request, Response } from 'express';

// Documentação COMPLETA com TODAS as APIs do sistema
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Khesef - API Completa de Controle Financeiro',
    version: '2.0.0',
    description: 'API completa para gerenciamento de finanças pessoais com suporte a transações, categorias, métodos de pagamento, relatórios, gráficos e administração',
    contact: {
      name: 'Suporte Khesef',
      email: 'support@xpiria.com'
    }
  },
  servers: [
    {
      url: '/',
      description: 'Servidor de desenvolvimento'
    }
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'connect.sid',
        description: 'Autenticação via cookie de sessão (para aplicação web)'
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'apikey',
        description: 'Token de acesso à API (para integrações externas)'
      }
    },
    schemas: {
      // === SCHEMAS DE USUÁRIO ===
      Usuario: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'ID do usuário' },
          email: { type: 'string', format: 'email', description: 'Email do usuário' },
          nome: { type: 'string', description: 'Nome do usuário' },
          tipo: { type: 'string', enum: ['usuario', 'admin', 'super_admin'], description: 'Tipo de usuário' },
          ativo: { type: 'boolean', description: 'Se o usuário está ativo' },
          data_criacao: { type: 'string', format: 'date-time', description: 'Data de criação' }
        }
      },
      NovoUsuario: {
        type: 'object',
        required: ['email', 'senha', 'nome'],
        properties: {
          email: { type: 'string', format: 'email', description: 'Email do usuário' },
          senha: { type: 'string', minLength: 6, description: 'Senha do usuário' },
          nome: { type: 'string', description: 'Nome do usuário' }
        }
      },
      Login: {
        type: 'object',
        required: ['email', 'senha'],
        properties: {
          email: { type: 'string', format: 'email', description: 'Email do usuário' },
          senha: { type: 'string', description: 'Senha do usuário' }
        }
      },
      // === SCHEMAS DE CARTEIRA ===
      Carteira: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'ID da carteira' },
          nome: { type: 'string', description: 'Nome da carteira' },
          descricao: { type: 'string', description: 'Descrição da carteira' },
          saldo_atual: { type: 'number', format: 'decimal', description: 'Saldo atual' },
          usuario_id: { type: 'integer', description: 'ID do usuário proprietário' }
        }
      },
      // === SCHEMAS DE CATEGORIA ===
      Categoria: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'ID da categoria' },
          nome: { type: 'string', description: 'Nome da categoria' },
          descricao: { type: 'string', description: 'Descrição da categoria' },
          icone: { type: 'string', description: 'Ícone da categoria' },
          cor: { type: 'string', description: 'Cor da categoria' },
          global: { type: 'boolean', description: 'Se é uma categoria global' },
          ativo: { type: 'boolean', description: 'Se a categoria está ativa' }
        }
      },
      NovaCategoria: {
        type: 'object',
        required: ['nome'],
        properties: {
          nome: { type: 'string', description: 'Nome da categoria' },
          descricao: { type: 'string', description: 'Descrição da categoria' },
          icone: { type: 'string', description: 'Ícone da categoria' },
          cor: { type: 'string', description: 'Cor da categoria em hexadecimal' }
        }
      },
      // === SCHEMAS DE TOKEN API ===
      ApiToken: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'ID do token' },
          nome: { type: 'string', description: 'Nome do token' },
          token_hash: { type: 'string', description: 'Hash do token' },
          ativo: { type: 'boolean', description: 'Se o token está ativo' },
          data_criacao: { type: 'string', format: 'date-time', description: 'Data de criação' },
          ultimo_uso: { type: 'string', format: 'date-time', description: 'Data do último uso' }
        }
      },
      NovoApiToken: {
        type: 'object',
        required: ['nome'],
        properties: {
          nome: { type: 'string', description: 'Nome do token' }
        }
      },
      // === SCHEMAS DE LEMBRETE ===
      Lembrete: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'ID do lembrete' },
          titulo: { type: 'string', description: 'Título do lembrete' },
          descricao: { type: 'string', description: 'Descrição do lembrete' },
          data_vencimento: { type: 'string', format: 'date', description: 'Data de vencimento' },
          valor: { type: 'number', format: 'decimal', description: 'Valor do lembrete' },
          status: { type: 'string', enum: ['Pendente', 'Concluido', 'Cancelado'], description: 'Status do lembrete' },
          recorrencia: { type: 'string', enum: ['Nenhuma', 'Diaria', 'Semanal', 'Mensal', 'Anual'], description: 'Tipo de recorrência' }
        }
      },
      NovoLembrete: {
        type: 'object',
        required: ['titulo', 'data_vencimento'],
        properties: {
          titulo: { type: 'string', description: 'Título do lembrete' },
          descricao: { type: 'string', description: 'Descrição do lembrete' },
          data_vencimento: { type: 'string', format: 'date', description: 'Data de vencimento' },
          valor: { type: 'number', format: 'decimal', description: 'Valor do lembrete' },
          recorrencia: { type: 'string', enum: ['Nenhuma', 'Diaria', 'Semanal', 'Mensal', 'Anual'], default: 'Nenhuma', description: 'Tipo de recorrência' }
        }
      },
      MetodoPagamento: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'ID do método de pagamento'
          },
          nome: {
            type: 'string',
            description: 'Nome do método de pagamento'
          },
          descricao: {
            type: 'string',
            description: 'Descrição do método'
          },
          icone: {
            type: 'string',
            description: 'Ícone do método'
          },
          cor: {
            type: 'string',
            description: 'Cor associada ao método'
          },
          global: {
            type: 'boolean',
            description: 'Se é um método global (disponível para todos)'
          },
          ativo: {
            type: 'boolean',
            description: 'Se o método está ativo'
          }
        },
        example: {
          id: 1,
          nome: 'PIX',
          descricao: 'Transferências instantâneas via PIX',
          icone: 'Smartphone',
          cor: '#10B981',
          global: true,
          ativo: true
        }
      },
      NovaTransacao: {
        type: 'object',
        required: ['descricao', 'valor', 'tipo', 'categoria_id', 'data_transacao'],
        properties: {
          descricao: {
            type: 'string',
            description: 'Descrição da transação (obrigatório)',
            example: 'Almoço no restaurante'
          },
          valor: {
            type: 'number',
            format: 'decimal',
            description: 'Valor da transação (obrigatório)',
            example: 45.90
          },
          tipo: {
            type: 'string',
            enum: ['Despesa', 'Receita'],
            description: 'Tipo da transação (obrigatório)',
            example: 'Despesa'
          },
          categoria_id: {
            type: 'integer',
            description: 'ID da categoria (obrigatório)',
            example: 3
          },
          forma_pagamento_id: {
            type: 'integer',
            description: 'ID do método de pagamento (OPCIONAL)\n\nSe não informado ou 0, será automaticamente atribuído PIX (ID: 1)\n\nMétodos disponíveis:\n- PIX: 1 (padrão)\n- Cartão de Crédito: 2\n- Dinheiro: 3\n- Cartão de Débito: 4\n- Transferência: 5\n- Boleto: 6',
            example: 1
          },
          data_transacao: {
            type: 'string',
            format: 'date',
            description: 'Data da transação no formato YYYY-MM-DD (obrigatório)',
            example: '2025-01-15'
          },
          status: {
            type: 'string',
            enum: ['Efetivada', 'Pendente', 'Agendada', 'Cancelada'],
            default: 'Efetivada',
            description: 'Status da transação (OPCIONAL - padrão: Efetivada)',
            example: 'Efetivada'
          },
          carteira_id: {
            type: 'integer',
            description: 'ID da carteira (OPCIONAL)\n\nSe não informado, será automaticamente atribuída a carteira do usuário logado',
            example: 1
          }
        },
        example: {
          descricao: 'Almoço Executivo',
          valor: 45.90,
          tipo: 'Despesa',
          categoria_id: 3,
          forma_pagamento_id: 1,
          data_transacao: '2025-01-15',
          status: 'Efetivada',
          carteira_id: 1
        }
      },
      Transacao: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'ID da transação' },
          descricao: { type: 'string', description: 'Descrição da transação' },
          valor: { type: 'number', format: 'decimal', description: 'Valor da transação' },
          tipo: { type: 'string', enum: ['Despesa', 'Receita'], description: 'Tipo da transação' },
          categoria_id: { type: 'integer', description: 'ID da categoria' },
          forma_pagamento_id: { type: 'integer', description: 'ID do método de pagamento' },
          data_transacao: { type: 'string', format: 'date', description: 'Data da transação' },
          status: { type: 'string', enum: ['Efetivada', 'Pendente', 'Agendada', 'Cancelada'] },
          carteira_id: { type: 'integer', description: 'ID da carteira' },
          data_registro: { type: 'string', format: 'date-time', description: 'Data de registro' }
        }
      }
    }
  },
  paths: {
    // === AUTENTICAÇÃO ===
    '/api/auth/register': {
      post: {
        summary: 'Registrar novo usuário',
        tags: ['Autenticação'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NovoUsuario' }
            }
          }
        },
        responses: {
          '201': {
            description: 'Usuário criado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Usuario' }
              }
            }
          },
          '400': { description: 'Dados inválidos ou email já existe' }
        }
      }
    },
    '/api/auth/login': {
      post: {
        summary: 'Fazer login',
        tags: ['Autenticação'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Login' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Login realizado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/Usuario' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          '401': { description: 'Credenciais inválidas' }
        }
      }
    },
    '/api/auth/logout': {
      post: {
        summary: 'Fazer logout',
        tags: ['Autenticação'],
        security: [{ cookieAuth: [] }],
        responses: {
          '200': { description: 'Logout realizado com sucesso' }
        }
      }
    },
    '/api/auth/verify': {
      get: {
        summary: 'Verificar autenticação',
        tags: ['Autenticação'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Usuário autenticado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Usuario' }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    // === USUÁRIOS ===
    '/api/users/profile': {
      get: {
        summary: 'Obter perfil do usuário',
        tags: ['Usuários'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Perfil do usuário',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Usuario' }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      },
      put: {
        summary: 'Atualizar perfil do usuário',
        tags: ['Usuários'],
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nome: { type: 'string', description: 'Nome do usuário' },
                  email: { type: 'string', format: 'email', description: 'Email do usuário' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Perfil atualizado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Usuario' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/users/password': {
      put: {
        summary: 'Alterar senha do usuário',
        tags: ['Usuários'],
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['senhaAtual', 'novaSenha'],
                properties: {
                  senhaAtual: { type: 'string', description: 'Senha atual' },
                  novaSenha: { type: 'string', minLength: 6, description: 'Nova senha' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Senha alterada com sucesso' },
          '400': { description: 'Senha atual incorreta ou nova senha inválida' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    // === CARTEIRAS ===
    '/api/wallet/current': {
      get: {
        summary: 'Obter carteira atual do usuário',
        tags: ['Carteiras'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Carteira atual',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Carteira' }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      },
      put: {
        summary: 'Atualizar carteira atual',
        tags: ['Carteiras'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nome: { type: 'string', description: 'Nome da carteira' },
                  descricao: { type: 'string', description: 'Descrição da carteira' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Carteira atualizada com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Carteira' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    // === CATEGORIAS ===
    '/api/categories': {
      get: {
        summary: 'Obter todas as categorias do usuário',
        tags: ['Categorias'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de categorias',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Categoria' }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      },
      post: {
        summary: 'Criar nova categoria',
        tags: ['Categorias'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NovaCategoria' }
            }
          }
        },
        responses: {
          '201': {
            description: 'Categoria criada com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Categoria' }
              }
            }
          },
          '400': { description: 'Dados inválidos ou nome já existe' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/categories/{id}': {
      get: {
        summary: 'Obter categoria específica',
        tags: ['Categorias'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID da categoria'
          }
        ],
        responses: {
          '200': {
            description: 'Dados da categoria',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Categoria' }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Categoria não encontrada' }
        }
      },
      put: {
        summary: 'Atualizar categoria',
        tags: ['Categorias'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID da categoria'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NovaCategoria' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Categoria atualizada com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Categoria' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão para editar categoria global' },
          '404': { description: 'Categoria não encontrada' }
        }
      },
      delete: {
        summary: 'Excluir categoria',
        tags: ['Categorias'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID da categoria'
          }
        ],
        responses: {
          '200': { description: 'Categoria excluída com sucesso' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão para excluir categoria global' },
          '404': { description: 'Categoria não encontrada' }
        }
      }
    },
    // === TOKENS DE API ===
    '/api/tokens': {
      get: {
        summary: 'Obter tokens de API do usuário',
        tags: ['Tokens de API'],
        security: [{ cookieAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de tokens',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ApiToken' }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      },
      post: {
        summary: 'Criar novo token de API',
        tags: ['Tokens de API'],
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NovoApiToken' }
            }
          }
        },
        responses: {
          '201': {
            description: 'Token criado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'Token de acesso (mostrado apenas uma vez)' },
                    tokenData: { $ref: '#/components/schemas/ApiToken' }
                  }
                }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/tokens/{id}': {
      get: {
        summary: 'Obter token específico',
        tags: ['Tokens de API'],
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do token'
          }
        ],
        responses: {
          '200': {
            description: 'Dados do token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiToken' }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Token não encontrado' }
        }
      },
      put: {
        summary: 'Atualizar token',
        tags: ['Tokens de API'],
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do token'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nome: { type: 'string', description: 'Nome do token' },
                  ativo: { type: 'boolean', description: 'Se o token está ativo' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Token atualizado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiToken' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Token não encontrado' }
        }
      },
      delete: {
        summary: 'Excluir token',
        tags: ['Tokens de API'],
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do token'
          }
        ],
        responses: {
          '200': { description: 'Token excluído com sucesso' },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Token não encontrado' }
        }
      }
    },
    '/api/tokens/{id}/rotate': {
      post: {
        summary: 'Regenerar token',
        tags: ['Tokens de API'],
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do token'
          }
        ],
        responses: {
          '200': {
            description: 'Token regenerado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'Novo token de acesso' },
                    tokenData: { $ref: '#/components/schemas/ApiToken' }
                  }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Token não encontrado' }
        }
      }
    },
    // === LEMBRETES ===
    '/api/reminders': {
      get: {
        summary: 'Obter lembretes do usuário',
        tags: ['Lembretes'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de lembretes',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Lembrete' }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      },
      post: {
        summary: 'Criar novo lembrete',
        tags: ['Lembretes'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NovoLembrete' }
            }
          }
        },
        responses: {
          '201': {
            description: 'Lembrete criado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Lembrete' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/reminders/{id}': {
      get: {
        summary: 'Obter lembrete específico',
        tags: ['Lembretes'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do lembrete'
          }
        ],
        responses: {
          '200': {
            description: 'Dados do lembrete',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Lembrete' }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Lembrete não encontrado' }
        }
      },
      put: {
        summary: 'Atualizar lembrete',
        tags: ['Lembretes'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do lembrete'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NovoLembrete' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Lembrete atualizado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Lembrete' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Lembrete não encontrado' }
        }
      },
      delete: {
        summary: 'Excluir lembrete',
        tags: ['Lembretes'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do lembrete'
          }
        ],
        responses: {
          '200': { description: 'Lembrete excluído com sucesso' },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Lembrete não encontrado' }
        }
      },
      patch: {
        summary: 'Marcar lembrete como concluído',
        tags: ['Lembretes'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do lembrete'
          }
        ],
        responses: {
          '200': {
            description: 'Lembrete marcado como concluído',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Lembrete' }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Lembrete não encontrado' }
        }
      }
    },
    // === RELATÓRIOS ===
    '/api/reports/monthly': {
      get: {
        summary: 'Gerar relatório mensal',
        tags: ['Relatórios'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'ano',
            schema: { type: 'integer' },
            description: 'Ano do relatório'
          },
          {
            in: 'query',
            name: 'mes',
            schema: { type: 'integer', minimum: 1, maximum: 12 },
            description: 'Mês do relatório'
          },
          {
            in: 'query',
            name: 'formato',
            schema: { type: 'string', enum: ['json', 'pdf', 'excel'] },
            description: 'Formato do relatório'
          }
        ],
        responses: {
          '200': {
            description: 'Relatório gerado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    periodo: { type: 'string', description: 'Período do relatório' },
                    totalReceitas: { type: 'number', description: 'Total de receitas' },
                    totalDespesas: { type: 'number', description: 'Total de despesas' },
                    saldoFinal: { type: 'number', description: 'Saldo final do período' },
                    transacoes: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Transacao' }
                    }
                  }
                }
              },
              'application/pdf': {
                schema: { type: 'string', format: 'binary' }
              },
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/reports/annual': {
      get: {
        summary: 'Gerar relatório anual',
        tags: ['Relatórios'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'ano',
            schema: { type: 'integer' },
            description: 'Ano do relatório'
          },
          {
            in: 'query',
            name: 'formato',
            schema: { type: 'string', enum: ['json', 'pdf', 'excel'] },
            description: 'Formato do relatório'
          }
        ],
        responses: {
          '200': {
            description: 'Relatório anual gerado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ano: { type: 'integer', description: 'Ano do relatório' },
                    totalReceitas: { type: 'number', description: 'Total de receitas' },
                    totalDespesas: { type: 'number', description: 'Total de despesas' },
                    saldoFinal: { type: 'number', description: 'Saldo final do ano' },
                    meses: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          mes: { type: 'integer' },
                          receitas: { type: 'number' },
                          despesas: { type: 'number' },
                          saldo: { type: 'number' }
                        }
                      }
                    }
                  }
                }
              },
              'application/pdf': {
                schema: { type: 'string', format: 'binary' }
              },
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/reports/download/{filename}': {
      get: {
        summary: 'Download de arquivo de relatório',
        tags: ['Relatórios'],
        parameters: [
          {
            in: 'path',
            name: 'filename',
            required: true,
            schema: { type: 'string' },
            description: 'Nome do arquivo'
          }
        ],
        responses: {
          '200': {
            description: 'Arquivo de relatório',
            content: {
              'application/pdf': {
                schema: { type: 'string', format: 'binary' }
              },
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          },
          '404': { description: 'Arquivo não encontrado' }
        }
      }
    },
    // === GRÁFICOS ===
    '/api/charts/bar': {
      get: {
        summary: 'Gerar gráfico de barras SVG',
        tags: ['Gráficos'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'periodo',
            schema: { type: 'string', enum: ['mensal', 'anual'] },
            description: 'Período do gráfico'
          },
          {
            in: 'query',
            name: 'ano',
            schema: { type: 'integer' },
            description: 'Ano'
          },
          {
            in: 'query',
            name: 'mes',
            schema: { type: 'integer' },
            description: 'Mês'
          }
        ],
        responses: {
          '200': {
            description: 'Gráfico SVG gerado',
            content: {
              'image/svg+xml': {
                schema: { type: 'string' }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/charts/pizza': {
      get: {
        summary: 'Gerar gráfico de pizza SVG',
        tags: ['Gráficos'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'periodo',
            schema: { type: 'string', enum: ['mensal', 'anual'] },
            description: 'Período do gráfico'
          },
          {
            in: 'query',
            name: 'ano',
            schema: { type: 'integer' },
            description: 'Ano'
          },
          {
            in: 'query',
            name: 'mes',
            schema: { type: 'integer' },
            description: 'Mês'
          }
        ],
        responses: {
          '200': {
            description: 'Gráfico de pizza SVG gerado',
            content: {
              'image/svg+xml': {
                schema: { type: 'string' }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/charts/line-evolution': {
      get: {
        summary: 'Gerar gráfico de evolução em linha SVG',
        tags: ['Gráficos'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'query',
            name: 'periodo',
            schema: { type: 'string', enum: ['mensal', 'anual'] },
            description: 'Período do gráfico'
          },
          {
            in: 'query',
            name: 'ano',
            schema: { type: 'integer' },
            description: 'Ano'
          },
          {
            in: 'query',
            name: 'mes',
            schema: { type: 'integer' },
            description: 'Mês'
          }
        ],
        responses: {
          '200': {
            description: 'Gráfico de evolução SVG gerado',
            content: {
              'image/svg+xml': {
                schema: { type: 'string' }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/charts/download/{filename}': {
      get: {
        summary: 'Download de arquivo de gráfico',
        tags: ['Gráficos'],
        parameters: [
          {
            in: 'path',
            name: 'filename',
            required: true,
            schema: { type: 'string' },
            description: 'Nome do arquivo'
          }
        ],
        responses: {
          '200': {
            description: 'Arquivo de gráfico',
            content: {
              'image/svg+xml': {
                schema: { type: 'string' }
              },
              'image/png': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          },
          '404': { description: 'Arquivo não encontrado' }
        }
      }
    },
    '/api/transactions': {
      get: {
        summary: 'Obtém todas as transações da carteira atual',
        tags: ['Transações'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de transações',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Transacao' }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      },
      post: {
        summary: 'Cria uma nova transação',
        description: 'Cria uma nova transação financeira.\n\n**Método de Pagamento**: Se `forma_pagamento_id` não for informado ou for 0, será automaticamente atribuído PIX como padrão.\n\n**Métodos de Pagamento Globais Disponíveis**:\n- PIX (ID: 1) - Padrão\n- Cartão de Crédito (ID: 2)\n- Dinheiro (ID: 3)',
        tags: ['Transações'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NovaTransacao' },
              examples: {
                completo: {
                  summary: 'Exemplo com todos os campos',
                  description: 'Transação com todos os campos preenchidos (opcionais e obrigatórios)',
                  value: {
                    descricao: 'Almoço Executivo',
                    valor: 45.90,
                    tipo: 'Despesa',
                    categoria_id: 3,
                    forma_pagamento_id: 1,
                    data_transacao: '2025-01-15',
                    status: 'Efetivada',
                    carteira_id: 1
                  }
                },
                minimo: {
                  summary: 'Exemplo apenas campos obrigatórios',
                  description: 'PIX e carteira do usuário serão atribuídos automaticamente',
                  value: {
                    descricao: 'Compras no supermercado',
                    valor: 125.50,
                    tipo: 'Despesa',
                    categoria_id: 1,
                    data_transacao: '2025-01-15'
                  }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Transação criada com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Transacao' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Categoria não encontrada' }
        }
      }
    },
    '/api/transactions/recent': {
      get: {
        summary: 'Obtém as transações recentes da carteira atual',
        tags: ['Transações'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de transações recentes',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Transacao' }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/transactions/{id}': {
      get: {
        summary: 'Obtém uma transação específica',
        tags: ['Transações'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            schema: { type: 'integer' },
            required: true,
            description: 'ID da transação'
          }
        ],
        responses: {
          '200': {
            description: 'Dados da transação',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Transacao' }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Transação não encontrada' },
          '403': { description: 'Acesso negado (transação de outra carteira)' }
        }
      },
      put: {
        summary: 'Atualiza uma transação',
        tags: ['Transações'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            schema: { type: 'integer' },
            required: true,
            description: 'ID da transação'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NovaTransacao' },
              examples: {
                atualizacao: {
                  summary: 'Atualização completa da transação',
                  description: 'Exemplo de atualização de uma transação existente',
                  value: {
                    descricao: 'Jantar no restaurante - Atualizado',
                    valor: 89.50,
                    tipo: 'Despesa',
                    categoria_id: 3,
                    forma_pagamento_id: 2,
                    data_transacao: '2025-01-16',
                    status: 'Efetivada',
                    carteira_id: 1
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Transação atualizada com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Transacao' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Acesso negado (transação de outra carteira)' },
          '404': { description: 'Transação não encontrada' }
        }
      },
      patch: {
        summary: 'Atualiza parcialmente uma transação',
        tags: ['Transações'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            schema: { type: 'integer' },
            required: true,
            description: 'ID da transação'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  descricao: { type: 'string', description: 'Nova descrição da transação' },
                  valor: { type: 'number', format: 'decimal', description: 'Novo valor da transação' },
                  tipo: { type: 'string', enum: ['Despesa', 'Receita'], description: 'Novo tipo da transação' },
                  categoria_id: { type: 'integer', description: 'Novo ID da categoria' },
                  forma_pagamento_id: { type: 'integer', description: 'Novo ID do método de pagamento' },
                  data_transacao: { type: 'string', format: 'date', description: 'Nova data da transação' },
                  status: { type: 'string', enum: ['Efetivada', 'Pendente', 'Agendada', 'Cancelada'], description: 'Novo status da transação' }
                }
              },
              examples: {
                mudancaStatus: {
                  summary: 'Alterar apenas o status',
                  description: 'Exemplo de alteração apenas do status da transação',
                  value: {
                    status: 'Cancelada'
                  }
                },
                mudancaValor: {
                  summary: 'Alterar valor e descrição',
                  description: 'Exemplo de alteração do valor e descrição',
                  value: {
                    descricao: 'Compra corrigida',
                    valor: 75.30
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Transação atualizada parcialmente com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Transacao' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Acesso negado (transação de outra carteira)' },
          '404': { description: 'Transação não encontrada' }
        }
      },
      delete: {
        summary: 'Remove uma transação',
        tags: ['Transações'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            schema: { type: 'integer' },
            required: true,
            description: 'ID da transação'
          }
        ],
        responses: {
          '200': {
            description: 'Transação removida com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Transação removida com sucesso' }
                  }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Acesso negado (transação de outra carteira)' },
          '404': { description: 'Transação não encontrada' }
        }
      }
    },
    
    // === DASHBOARD ===
    '/api/dashboard/summary': {
      get: {
        summary: 'Obtém resumo estatístico do dashboard',
        description: 'Retorna dados consolidados para exibição no dashboard: receitas/despesas por categoria, dados mensais, totais e métricas financeiras',
        tags: ['Dashboard'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Dados do dashboard obtidos com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    monthlyData: {
                      type: 'array',
                      description: 'Dados mensais de receitas e despesas',
                      items: {
                        type: 'object',
                        properties: {
                          month: { type: 'string', description: 'Nome do mês', example: 'Jan' },
                          income: { type: 'number', description: 'Total de receitas do mês', example: 5000.00 },
                          expenses: { type: 'number', description: 'Total de despesas do mês', example: 3200.50 }
                        }
                      }
                    },
                    expensesByCategory: {
                      type: 'array',
                      description: 'Despesas agrupadas por categoria',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', description: 'Nome da categoria', example: 'Alimentação' },
                          value: { type: 'number', description: 'Total gasto na categoria', example: 1200.50 },
                          fill: { type: 'string', description: 'Cor para gráficos', example: '#8884d8' }
                        }
                      }
                    },
                    incomeByCategory: {
                      type: 'array',
                      description: 'Receitas agrupadas por categoria',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', description: 'Nome da categoria', example: 'Salário' },
                          value: { type: 'number', description: 'Total recebido na categoria', example: 4500.00 },
                          fill: { type: 'string', description: 'Cor para gráficos', example: '#82ca9d' }
                        }
                      }
                    },
                    totalIncome: { 
                      type: 'number', 
                      description: 'Total de receitas no período', 
                      example: 5000.00 
                    },
                    totalExpenses: { 
                      type: 'number', 
                      description: 'Total de despesas no período', 
                      example: 3200.50 
                    },
                    balance: { 
                      type: 'number', 
                      description: 'Saldo líquido (receitas - despesas)', 
                      example: 1799.50 
                    }
                  }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '500': { description: 'Erro interno do servidor' }
        }
      }
    },
    
    '/api/payment-methods': {
      get: {
        summary: 'Obter formas de pagamento do usuário (globais + personalizadas)',
        tags: ['Formas de Pagamento'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de formas de pagamento',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MetodoPagamento' }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Criar nova forma de pagamento personalizada',
        tags: ['Formas de Pagamento'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nome'],
                properties: {
                  nome: {
                    type: 'string',
                    description: 'Nome da forma de pagamento (obrigatório)',
                    example: 'Cartão Empresa'
                  },
                  descricao: {
                    type: 'string',
                    description: 'Descrição da forma de pagamento (opcional)',
                    example: 'Cartão corporativo da empresa'
                  },
                  icone: {
                    type: 'string',
                    description: 'Ícone da forma de pagamento (opcional)',
                    example: '🏢'
                  },
                  cor: {
                    type: 'string',
                    description: 'Cor em hexadecimal (opcional)',
                    example: '#2196F3'
                  }
                },
                example: {
                  nome: 'Cartão Empresa',
                  descricao: 'Cartão corporativo da empresa',
                  icone: '🏢',
                  cor: '#2196F3'
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Forma de pagamento criada com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MetodoPagamento' }
              }
            }
          },
          '400': { description: 'Dados inválidos ou nome já existe' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/api/payment-methods/global': {
      get: {
        summary: 'Obter métodos de pagamento globais',
        description: 'Lista os métodos de pagamento globais disponíveis para todas as transações.\n\n**Métodos Globais Padrão**:\n- PIX (ID: 1) - Usado como padrão quando não especificado\n- Cartão de Crédito (ID: 2)\n- Dinheiro (ID: 3)',
        tags: ['Formas de Pagamento'],
        responses: {
          '200': {
            description: 'Lista de métodos de pagamento globais',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MetodoPagamento' }
                },
                example: [
                  {
                    id: 1,
                    nome: 'PIX',
                    descricao: 'Transferências instantâneas via PIX',
                    icone: 'Smartphone',
                    cor: '#10B981',
                    global: true,
                    ativo: true
                  },
                  {
                    id: 2,
                    nome: 'Cartão de Crédito',
                    descricao: 'Pagamentos realizados com cartão de crédito',
                    icone: 'CreditCard',
                    cor: '#3B82F6',
                    global: true,
                    ativo: true
                  }
                ]
              }
            }
          }
        }
      }
    },
    // === SETUP DO SISTEMA ===
    '/api/setup/status': {
      get: {
        summary: 'Verificar status do setup',
        tags: ['Setup'],
        responses: {
          '200': {
            description: 'Status do setup',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    isSetupComplete: { type: 'boolean', description: 'Se o setup foi concluído' },
                    dbConnected: { type: 'boolean', description: 'Se o banco está conectado' },
                    hasAdmin: { type: 'boolean', description: 'Se existe um usuário admin' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/setup/test-connection': {
      post: {
        summary: 'Testar conexão com banco de dados',
        tags: ['Setup'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['dbUrl'],
                properties: {
                  dbUrl: { type: 'string', description: 'URL de conexão do banco de dados' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Conexão testada com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          '400': { description: 'Erro na conexão' }
        }
      }
    },
    '/api/setup/create-admin': {
      post: {
        summary: 'Criar usuário administrador',
        tags: ['Setup'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'senha', 'nome'],
                properties: {
                  email: { type: 'string', format: 'email', description: 'Email do admin' },
                  senha: { type: 'string', minLength: 6, description: 'Senha do admin' },
                  nome: { type: 'string', description: 'Nome do admin' }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Admin criado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Usuario' }
              }
            }
          },
          '400': { description: 'Dados inválidos' }
        }
      }
    },
    '/api/setup/run': {
      post: {
        summary: 'Executar setup completo do sistema',
        tags: ['Setup'],
        responses: {
          '200': {
            description: 'Setup executado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          '500': { description: 'Erro no setup' }
        }
      }
    },
    '/api/setup/finish': {
      post: {
        summary: 'Finalizar setup do sistema',
        tags: ['Setup'],
        responses: {
          '200': {
            description: 'Setup finalizado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    // === ADMINISTRAÇÃO ===
    '/api/admin/stats': {
      get: {
        summary: 'Obter estatísticas do sistema',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Estatísticas do sistema',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalUsers: { type: 'integer', description: 'Total de usuários' },
                    totalTransactions: { type: 'integer', description: 'Total de transações' },
                    totalWallets: { type: 'integer', description: 'Total de carteiras' },
                    systemUptime: { type: 'string', description: 'Tempo de atividade do sistema' }
                  }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' }
        }
      }
    },
    '/api/admin/users': {
      get: {
        summary: 'Listar todos os usuários (admin)',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de usuários',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Usuario' }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' }
        }
      },
      post: {
        summary: 'Criar novo usuário (admin)',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NovoUsuario' }
            }
          }
        },
        responses: {
          '201': {
            description: 'Usuário criado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Usuario' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' }
        }
      }
    },
    '/api/admin/users/{id}': {
      get: {
        summary: 'Obter usuário específico (admin)',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do usuário'
          }
        ],
        responses: {
          '200': {
            description: 'Dados do usuário',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Usuario' }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' },
          '404': { description: 'Usuário não encontrado' }
        }
      },
      put: {
        summary: 'Atualizar usuário (admin)',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do usuário'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nome: { type: 'string', description: 'Nome do usuário' },
                  email: { type: 'string', format: 'email', description: 'Email do usuário' },
                  tipo: { type: 'string', enum: ['usuario', 'admin', 'super_admin'], description: 'Tipo do usuário' },
                  ativo: { type: 'boolean', description: 'Se o usuário está ativo' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Usuário atualizado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Usuario' }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' },
          '404': { description: 'Usuário não encontrado' }
        }
      },
      delete: {
        summary: 'Excluir usuário (admin)',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
            description: 'ID do usuário'
          }
        ],
        responses: {
          '200': { description: 'Usuário excluído com sucesso' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' },
          '404': { description: 'Usuário não encontrado' }
        }
      }
    },
    '/api/admin/impersonate': {
      post: {
        summary: 'Personificar usuário (admin)',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId'],
                properties: {
                  userId: { type: 'integer', description: 'ID do usuário a ser personificado' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Personificação iniciada com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    impersonatedUser: { $ref: '#/components/schemas/Usuario' }
                  }
                }
              }
            }
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' },
          '404': { description: 'Usuário não encontrado' }
        }
      }
    },
    '/api/admin/stop-impersonation': {
      post: {
        summary: 'Parar personificação',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Personificação finalizada com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' }
        }
      }
    },
    '/api/admin/logo': {
      post: {
        summary: 'Upload de logo da empresa',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  logo: { type: 'string', format: 'binary', description: 'Arquivo de logo' },
                  favicon: { type: 'string', format: 'binary', description: 'Arquivo de favicon' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Logo atualizado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    logoPath: { type: 'string' },
                    faviconPath: { type: 'string' }
                  }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' }
        }
      },
      delete: {
        summary: 'Remover logo da empresa',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': { description: 'Logo removido com sucesso' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' }
        }
      }
    },
    '/api/logo': {
      get: {
        summary: 'Obter logo atual da empresa',
        tags: ['Administração'],
        responses: {
          '200': {
            description: 'Logo da empresa',
            content: {
              'image/png': { schema: { type: 'string', format: 'binary' } },
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'image/svg+xml': { schema: { type: 'string' } }
            }
          },
          '404': { description: 'Logo não encontrado' }
        }
      }
    },
    '/api/admin/welcome-messages': {
      get: {
        summary: 'Obter mensagens de boas-vindas',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de mensagens de boas-vindas',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      tipo: { type: 'string' },
                      titulo: { type: 'string' },
                      mensagem: { type: 'string' },
                      ativo: { type: 'boolean' }
                    }
                  }
                }
              }
            }
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' }
        }
      },
      post: {
        summary: 'Criar nova mensagem de boas-vindas',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tipo', 'titulo', 'mensagem'],
                properties: {
                  tipo: { type: 'string', description: 'Tipo da mensagem' },
                  titulo: { type: 'string', description: 'Título da mensagem' },
                  mensagem: { type: 'string', description: 'Conteúdo da mensagem' },
                  ativo: { type: 'boolean', default: true, description: 'Se a mensagem está ativa' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Mensagem criada com sucesso' },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' }
        }
      }
    },
    '/api/admin/welcome-messages/{type}': {
      get: {
        summary: 'Obter mensagem de boas-vindas por tipo',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'type',
            required: true,
            schema: { type: 'string' },
            description: 'Tipo da mensagem'
          }
        ],
        responses: {
          '200': { description: 'Mensagem encontrada' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' },
          '404': { description: 'Mensagem não encontrada' }
        }
      },
      put: {
        summary: 'Atualizar mensagem de boas-vindas',
        tags: ['Administração'],
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'type',
            required: true,
            schema: { type: 'string' },
            description: 'Tipo da mensagem'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  titulo: { type: 'string' },
                  mensagem: { type: 'string' },
                  ativo: { type: 'boolean' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Mensagem atualizada com sucesso' },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Permissão negada' },
          '404': { description: 'Mensagem não encontrada' }
        }
      }
    },
    // === OUTROS ENDPOINTS ===
    '/api/api-guide': {
      get: {
        summary: 'Obter guia da API',
        tags: ['Documentação'],
        responses: {
          '200': {
            description: 'Guia de uso da API',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    version: { type: 'string' },
                    endpoints: { type: 'array', items: { type: 'object' } }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/changelog': {
      get: {
        summary: 'Obter changelog do sistema',
        tags: ['Documentação'],
        responses: {
          '200': {
            description: 'Changelog do sistema',
            content: {
              'text/plain': {
                schema: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

export function setupSwagger(app: Express) {
  // Rota para a documentação Swagger
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  
  // Rota para o JSON do Swagger
  app.get('/docs.json', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
  });
  
  console.log('Documentação Swagger disponível em /docs');
  console.log('JSON do Swagger disponível em /docs.json');
}