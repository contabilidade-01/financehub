"use strict";
/**
 * @swagger
 * tags:
 *   name: Usuários
 *   description: API para gerenciamento de usuários
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     CadastroUsuario:
 *       type: object
 *       required:
 *         - nome
 *         - email
 *         - senha
 *       properties:
 *         nome:
 *           type: string
 *           description: Nome completo do usuário
 *         email:
 *           type: string
 *           format: email
 *           description: Email do usuário (será usado para login)
 *         senha:
 *           type: string
 *           format: password
 *           description: Senha do usuário
 *       example:
 *         nome: Maria Silva
 *         email: maria@exemplo.com
 *         senha: senha123
 *
 *     PerfilUsuario:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID do usuário
 *         nome:
 *           type: string
 *           description: Nome completo do usuário
 *         email:
 *           type: string
 *           format: email
 *           description: Email do usuário
 *         data_cadastro:
 *           type: string
 *           format: date-time
 *           description: Data de criação da conta
 *         ultimo_acesso:
 *           type: string
 *           format: date-time
 *           description: Data do último acesso
 *       example:
 *         id: 1
 *         nome: Maria Silva
 *         email: maria@exemplo.com
 *         data_cadastro: "2025-05-01T10:30:00Z"
 *         ultimo_acesso: "2025-05-05T15:20:00Z"
 *
 *     AtualizarPerfil:
 *       type: object
 *       properties:
 *         nome:
 *           type: string
 *           description: Nome completo do usuário
 *       example:
 *         nome: Maria Silva de Souza
 *
 *     AlterarSenha:
 *       type: object
 *       required:
 *         - senhaAtual
 *         - novaSenha
 *       properties:
 *         senhaAtual:
 *           type: string
 *           format: password
 *           description: Senha atual do usuário
 *         novaSenha:
 *           type: string
 *           format: password
 *           description: Nova senha do usuário
 *       example:
 *         senhaAtual: senha123
 *         novaSenha: novaSenha456
 */
/**
 * @swagger
 * /users/register:
 *   post:
 *     summary: Registra um novo usuário
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CadastroUsuario'
 *     responses:
 *       201:
 *         description: Usuário registrado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerfilUsuario'
 *       400:
 *         description: Dados inválidos ou email já utilizado
 */
/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Obtém o perfil do usuário autenticado
 *     tags: [Usuários] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerfilUsuario'
 *       401:
 *         description: Não autenticado
 *
 *   patch:
 *     summary: Atualiza o perfil do usuário autenticado
 *     tags: [Usuários] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AtualizarPerfil'
 *     responses:
 *       200:
 *         description: Perfil atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerfilUsuario'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 */
/**
 * @swagger
 * /users/password:
 *   post:
 *     summary: Altera a senha do usuário autenticado
 *     tags: [Usuários] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AlterarSenha'
 *     responses:
 *       200:
 *         description: Senha alterada com sucesso
 *       400:
 *         description: Dados inválidos ou senha atual incorreta
 *       401:
 *         description: Não autenticado
 */ 
