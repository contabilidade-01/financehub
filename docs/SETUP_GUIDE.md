# 🚀 Guia do Wizard de Setup

## Como Usar o Wizard de Setup

O sistema financeiro agora inclui um wizard de setup visual que facilita a configuração inicial do banco de dados e criação do usuário administrador.

### 📋 Pré-requisitos

1. **Banco PostgreSQL**: Tenha um banco PostgreSQL configurado e acessível
2. **URL de Conexão**: Tenha a URL de conexão do banco no formato:
   ```
   postgresql://usuario:senha@host:porta/banco
   ```

### 🔧 Ativando o Setup

1. **Edite o arquivo `.env`**:
   ```bash
   # Mude de:
   SETUP=false
   
   # Para:
   SETUP=true
   ```

2. **Reinicie o servidor**:
   ```bash
   npm run dev
   ```

### 🎯 Passos do Wizard

O wizard possui 4 passos sequenciais:

#### **Passo 1: Conexão com Banco de Dados**
- Insira a URL de conexão do PostgreSQL
- Teste a conexão antes de prosseguir
- Exemplo: `postgresql://usuario:senha@localhost:5432/financeiro`

#### **Passo 2: Usuário Administrador**
- Configure o nome do administrador
- Defina email e senha
- Valores padrão: `teste@teste.com` / `admin123`

#### **Passo 3: Confirmação**
- Revise todas as configurações
- Veja o que será criado:
  - Todas as tabelas do sistema
  - Usuário superadmin
  - Carteira padrão
  - 16 categorias globais
  - 6 formas de pagamento

#### **Passo 4: Conclusão**
- Setup executado com sucesso
- Credenciais de acesso
- Redirecionamento para login

### 📊 O que é Criado Automaticamente

#### **Categorias Globais (16)**
**Despesas:**
- 🍽️ Alimentação
- 🚗 Transporte
- 🏠 Moradia
- 🏥 Saúde
- 📚 Educação
- 🎮 Lazer
- 👕 Vestuário
- 🔧 Serviços
- 💰 Impostos
- 📦 Outros

**Receitas:**
- 💼 Salário
- 💻 Freelance
- 📈 Investimentos
- 🎁 Presentes
- 💸 Reembolso
- 📦 Outros

#### **Formas de Pagamento (6)**
- 📱 PIX
- 💳 Cartão de Crédito
- 💵 Dinheiro
- 🏦 Cartão de Débito
- 🏛️ Transferência
- 📄 Boleto

### 🔐 Credenciais Padrão

Após o setup, você pode fazer login com:
- **Email**: `teste@teste.com`
- **Senha**: `admin123`
- **Tipo**: Superadmin (acesso total ao sistema)

### 🛡️ Segurança

- O wizard só funciona quando `SETUP=true`
- Após o setup, recomenda-se alterar a senha padrão
- O modo setup é automaticamente desabilitado após a criação dos dados

### 🔄 Desabilitando o Setup

Após concluir o setup:

1. **Edite o arquivo `.env`**:
   ```bash
   SETUP=false
   ```

2. **Reinicie o servidor**:
   ```bash
   npm run dev
   ```

### 🚨 Troubleshooting

#### **Erro de Conexão**
- Verifique se o PostgreSQL está rodando
- Confirme a URL de conexão
- Teste a conectividade de rede

#### **Erro de Permissões**
- Verifique se o usuário tem permissões de criação de tabelas
- Confirme se o banco existe

#### **Setup Não Aparece**
- Verifique se `SETUP=true` no `.env`
- Reinicie o servidor após alterar o `.env`

### 📝 Logs

O setup gera logs detalhados no console do servidor:
```
🚀 Iniciando setup do sistema...
📋 Executando migrações...
👤 Criando usuário superadmin...
💰 Criando carteira padrão...
📂 Criando categorias globais...
💳 Criando formas de pagamento globais...
🔑 Criando token API...
✅ Setup concluído com sucesso!
```

### 🎉 Próximos Passos

Após o setup:
1. Faça login com as credenciais do admin
2. Explore o dashboard
3. Configure categorias personalizadas
4. Adicione suas primeiras transações
5. Explore os relatórios e gráficos

---

**💡 Dica**: O wizard é ideal para instalações novas ou quando você precisa resetar completamente o banco de dados. 