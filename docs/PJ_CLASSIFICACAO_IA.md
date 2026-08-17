# PJ — Integração N8N com Classificação IA

## Objetivo

Configurar o N8N para classificar transações PJ automaticamente via IA, reaproveitando o fluxo PF existente.

## Arquitetura Atual (PF)

```
WhatsApp (áudio/imagem) 
  ↓ WAHA
N8N: transcrição/OCR + IA classifica
  ↓
POST /api/transactions (PF)
  ↓
FinanceHub: insere em transacoes, exibe no app
```

## Extensão para PJ

Adicionar **ramo condicional** no N8N:

```
WhatsApp (áudio/imagem)
  ↓ WAHA
N8N: transcrição/OCR + IA classifica
  ↓ [Resolver: é PF ou PJ?]
  ├─ PF → POST /api/transactions
  └─ PJ → POST /api/empresas/:id/transacoes
```

### Opção A: Identificar por número WhatsApp

Pré-cadastrar no FinanceHub: "número 11999999999 → usuario_id 5, empresa_id 3"

Lookup em N8N:
```
GET /api/empresas?whatsapp=11999999999
→ { empresa_id: 3, usuario_id: 5, ... }
```

**Problemas:** requer manutenção fora do banco, não escala.

### Opção B: Identificar por contexto da mensagem (recomendado)

A mensagem do cliente contém "empresa" ou contexto PJ?

```javascript
if (transcricao.includes("empresa") || userData.tipo_pessoa === "juridica") {
  endpoint = `/api/empresas/${empresa_id}/transacoes`;
  // IA classifica conforme categorias PJ
} else {
  endpoint = `/api/transactions`;
  // IA classifica conforme categorias PF
}
```

## Configuração N8N — Passo a Passo

### 1. Preparar dados da empresa

Quando usuário PJ criar empresa no app:

```
POST /api/empresas
{
  "razao_social": "Empresa Teste LTDA",
  "cnpj": "12.345.678/0001-90"
}
→ 200 { empresa: {...}, contas_criadas: 17 }
```

FinanceHub cria `empresas` + 17 `empresas_contas` automaticamente.

Guardar `empresa_id` no N8N (ou via query manual):

```
GET /api/empresas
→ [ { id: 3, razao_social: "Empresa Teste LTDA", ... } ]
```

### 2. Prompt IA — Contexto PJ

Atual (PF):
```
Você é um classificador de transações pessoais. 
As categorias disponíveis são:
- Alimentação, Transporte, Moradia, ...

Classifique a transação em uma dessas categorias.
Responda em JSON: { categoria: "...", confiança: 0-100 }
```

Novo (PJ):
```
Você é um classificador de transações empresariais.
As contas contábeis disponíveis para esta empresa são:

1.01 Receita de Vendas
1.02 Receita de Serviços
...
3.01 Compras de Mercadoria (CMV)
...

Classifique a transação em uma dessas contas.
Responda em JSON: { conta_codigo: "3.01", conta_nome: "...", confiança: 0-100 }
```

### 3. Fluxo N8N Estendido

```
Webhook WhatsApp
  ↓
Parse áudio/imagem (WAHA)
  ↓
Lookup usuário (remoteJid → usuario_id)
  ↓
GET /api/empresas (listar empresas do user)
  ↓
[Condicional] Se empresas.length > 0:
  ├─ Usar primeira empresa (ou seletor)
  ├─ GET /api/empresas/{id}/contas (carregar contas PJ)
  ├─ Prompt IA com contexto PJ
  └─ POST /api/empresas/{id}/transacoes
  
[Else] (nenhuma empresa)
  ├─ GET /api/categories (carregar categorias PF)
  ├─ Prompt IA com contexto PF
  └─ POST /api/transactions
```

### 4. Implementação em N8N

**Node JavaScript:**
```javascript
// Após transcrição da mensagem
const usuario_id = msg.usuario_id; // do WhatsApp lookup
const transcricao = msg.texto;

// Listar empresas do usuário
const empresas = await fetch(`/api/empresas`, {
  headers: { 'apikey': apiKey }
}).then(r => r.json());

const temEmpresa = empresas && empresas.length > 0;

if (temEmpresa) {
  const empresa = empresas[0]; // MVP: primeira
  const contas = await fetch(`/api/empresas/${empresa.id}/contas`, {
    headers: { 'apikey': apiKey }
  }).then(r => r.json());

  // Preparar prompt PJ
  const prompt = `
    Você é um classificador de transações empresariais.
    As contas contábeis disponíveis são:
    ${contas.map(c => `${c.codigo} ${c.nome}`).join('\n')}
    
    Transação: "${transcricao}"
    Responda: { conta_codigo: "...", confiança: 0-100 }
  `;
  
  // IA classifica
  const classificacao = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }]
  });
  
  const resultado = JSON.parse(classificacao.choices[0].message.content);
  
  // Buscar ID da conta
  const conta = contas.find(c => c.codigo === resultado.conta_codigo);
  
  // Inserir transação
  return {
    tipo_entrada: 'pj',
    empresa_id: empresa.id,
    categoria_id: conta.id,
    descricao: transcricao,
    valor: extrairValor(transcricao),
    tipo: inferirTipo(transcricao),
    data_transacao: new Date().toISOString().slice(0, 10)
  };
} else {
  // PF: fluxo atual
  return {
    tipo_entrada: 'pf',
    categoria_id: /* classificação PF */,
    descricao: transcricao,
    // ... resto
  };
}
```

**Webhook POST:**
```javascript
if (data.tipo_entrada === 'pj') {
  endpoint = `${BASE_URL}/api/empresas/${data.empresa_id}/transacoes`;
  payload = {
    categoria_id: data.categoria_id,
    descricao: data.descricao,
    valor: data.valor,
    tipo: data.tipo,
    data_transacao: data.data_transacao,
    origem: 'whatsapp'
  };
} else {
  endpoint = `${BASE_URL}/api/transactions`;
  payload = {
    categoria_id: data.categoria_id,
    descricao: data.descricao,
    // ... resto PF
  };
}

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': apiKey
  },
  body: JSON.stringify(payload)
});
```

## Testes Manuais

1. **Cadastrar empresa via app:**
   ```
   POST /api/empresas
   { razao_social: "Teste LTDA", ... }
   → empresa_id = 5
   ```

2. **Simular webhook N8N:**
   ```
   POST /api/empresas/5/transacoes
   {
     "descricao": "Venda para cliente X",
     "valor": 2000,
     "tipo": "Receita",
     "categoria_id": 3,  // Receita de Vendas
     "data_transacao": "2026-08-17",
     "origem": "whatsapp"
   }
   → 201 { id: 42, ... }
   ```

3. **Verificar no app:**
   - Acesso `/p/dashboard` → resumo atualizado
   - Acesso `/p/transacoes` → transação aparece

## Futuros

- [ ] Seletor de empresa no app se N > 1
- [ ] Reclassificação manual no app
- [ ] Histórico de confiança IA por categoria
- [ ] Feedback loop: usuário rejeita/aceita classificação → treina modelo interno
