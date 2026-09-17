"use strict";
/**
 * @swagger
 * tags:
 *   name: API Guide
 *   description: Guia e documentação para uso da API
 */
/**
 * @swagger
 * /api:
 *   get:
 *     summary: Obtém informações sobre o uso da API
 *     tags: [API Guide]
 *     responses:
 *       200:
 *         description: Guia de uso da API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   description: Nome da API
 *                 version:
 *                   type: string
 *                   description: Versão da API
 *                 description:
 *                   type: string
 *                   description: Descrição da API
 *                 endpoints:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: string
 *                         description: Caminho do endpoint
 *                       methods:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: Métodos HTTP suportados
 *                       description:
 *                         type: string
 *                         description: Descrição do endpoint
 *                 authentication:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       description: Tipo de autenticação
 *                     header:
 *                       type: string
 *                       description: Nome do cabeçalho para autenticação
 *                     description:
 *                       type: string
 *                       description: Descrição do método de autenticação
 *                 documentation:
 *                   type: string
 *                   description: URL para documentação completa
 */ 
