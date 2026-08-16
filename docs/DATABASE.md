# Estrutura do Banco de Dados - Produção

Gerado em: 2025-10-02T15:17:01.678Z

## Extensões Necessárias

O banco de dados requer as seguintes extensões do PostgreSQL:

### pgcrypto
**Descrição:** Extensão que fornece funções criptográficas para PostgreSQL  
**Funções utilizadas:** gen_random_bytes, gen_random_uuid, crypt, gen_salt, digest, encrypt, decrypt, etc.  
**Comando de instalação:**
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**⚠️ Importante:** Esta extensão deve ser habilitada antes de executar qualquer operação que utilize funções criptográficas como `gen_random_bytes()` ou `gen_random_uuid()`.

## Tabela: api_tokens

### SQL DDL

```sql
CREATE TABLE public.api_tokens (    id INTEGER NOT NULL DEFAULT nextval('api_tokens_id_seq'::regclass),
    usuario_id INTEGER NOT NULL,
    token VARCHAR(255) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    data_expiracao TIMESTAMPTZ,
    ativo BOOLEAN NOT NULL DEFAULT true,
    master BOOLEAN NOT NULL DEFAULT false,
    rotacionavel BOOLEAN NOT NULL DEFAULT false
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('api_tokens_id_seq'::regclass) | - |
| usuario_id | integer(32,0) | - | NO | - | - |
| token | character varying(255) | 255 | NO | - | - |
| nome | character varying(100) | 100 | NO | - | - |
| descricao | text | - | YES | - | - |
| data_criacao | timestamp with time zone | - | YES | (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text) | - |
| data_expiracao | timestamp with time zone | - | YES | - | - |
| ativo | boolean | - | NO | true | - |
| master | boolean | - | NO | false | - |
| rotacionavel | boolean | - | NO | false | - |

### Chave Primária

- id

### Chaves Estrangeiras

- **usuario_id** → usuarios.id (api_tokens_usuario_id_usuarios_id_fk)

### Índices

- **api_tokens_token_unique**  (UNIQUE): {token} (btree)
- **api_tokens_usuario_id_master_unique**  (UNIQUE): {usuario_id,master} (btree)
### Constraints DDL

```sql
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_token_unique UNIQUE (token);
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_usuario_id_master_unique UNIQUE (usuario_id, master);
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_usuario_id_master_unique UNIQUE (usuario_id, master);
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
```


---

## Tabela: carteiras

### SQL DDL

```sql
CREATE TABLE public.carteiras (    id INTEGER NOT NULL DEFAULT nextval('carteiras_id_seq'::regclass),
    usuario_id INTEGER NOT NULL,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    saldo_atual NUMERIC(12,2) DEFAULT 0.00,
    data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text)
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('carteiras_id_seq'::regclass) | - |
| usuario_id | integer(32,0) | - | NO | - | - |
| nome | character varying(255) | 255 | NO | - | - |
| descricao | text | - | YES | - | - |
| saldo_atual | numeric(12,2) | - | YES | 0.00 | - |
| data_criacao | timestamp with time zone | - | YES | (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text) | - |

### Chave Primária

- id

### Chaves Estrangeiras

- **usuario_id** → usuarios.id (carteiras_usuario_id_usuarios_id_fk)
### Constraints DDL

```sql
ALTER TABLE public.carteiras ADD CONSTRAINT carteiras_pkey PRIMARY KEY (id);
ALTER TABLE public.carteiras ADD CONSTRAINT carteiras_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
```


---

## Tabela: categorias

### SQL DDL

```sql
CREATE TABLE public.categorias (    id INTEGER NOT NULL DEFAULT nextval('categorias_id_seq'::regclass),
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(10) NOT NULL DEFAULT 'Despesa'::character varying,
    cor VARCHAR(50),
    icone VARCHAR(100),
    descricao TEXT,
    usuario_id INTEGER,
    global BOOLEAN NOT NULL DEFAULT false
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('categorias_id_seq'::regclass) | - |
| nome | character varying(255) | 255 | NO | - | - |
| tipo | character varying(10) | 10 | NO | 'Despesa'::character varying | - |
| cor | character varying(50) | 50 | YES | - | - |
| icone | character varying(100) | 100 | YES | - | - |
| descricao | text | - | YES | - | - |
| usuario_id | integer(32,0) | - | YES | - | - |
| global | boolean | - | NO | false | - |

### Chave Primária

- id

### Chaves Estrangeiras

- **usuario_id** → usuarios.id (categorias_usuario_id_usuarios_id_fk)

### Índices

- **categorias_nome_global_unique**  (UNIQUE): {nome,global} (btree)
### Constraints DDL

```sql
ALTER TABLE public.categorias ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);
ALTER TABLE public.categorias ADD CONSTRAINT categorias_nome_global_unique UNIQUE (nome, global);
ALTER TABLE public.categorias ADD CONSTRAINT categorias_nome_global_unique UNIQUE (nome, global);
ALTER TABLE public.categorias ADD CONSTRAINT categorias_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
```


---

## Tabela: formas_pagamento

### SQL DDL

```sql
CREATE TABLE public.formas_pagamento (    id INTEGER NOT NULL DEFAULT nextval('formas_pagamento_id_seq'::regclass),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    icone VARCHAR(100),
    cor VARCHAR(50),
    usuario_id INTEGER,
    global BOOLEAN NOT NULL DEFAULT false,
    ativo BOOLEAN NOT NULL DEFAULT true,
    data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text)
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('formas_pagamento_id_seq'::regclass) | - |
| nome | character varying(255) | 255 | NO | - | - |
| descricao | text | - | YES | - | - |
| icone | character varying(100) | 100 | YES | - | - |
| cor | character varying(50) | 50 | YES | - | - |
| usuario_id | integer(32,0) | - | YES | - | - |
| global | boolean | - | NO | false | - |
| ativo | boolean | - | NO | true | - |
| data_criacao | timestamp with time zone | - | YES | (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text) | - |

### Chave Primária

- id

### Chaves Estrangeiras

- **usuario_id** → usuarios.id (formas_pagamento_usuario_id_usuarios_id_fk)

### Índices

- **formas_pagamento_nome_global_unique**  (UNIQUE): {nome,global} (btree)
### Constraints DDL

```sql
ALTER TABLE public.formas_pagamento ADD CONSTRAINT formas_pagamento_pkey PRIMARY KEY (id);
ALTER TABLE public.formas_pagamento ADD CONSTRAINT formas_pagamento_nome_global_unique UNIQUE (nome, global);
ALTER TABLE public.formas_pagamento ADD CONSTRAINT formas_pagamento_nome_global_unique UNIQUE (nome, global);
ALTER TABLE public.formas_pagamento ADD CONSTRAINT formas_pagamento_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
```


---

## Tabela: historico_cancelamentos

### SQL DDL

```sql
CREATE TABLE public.historico_cancelamentos (    id INTEGER NOT NULL DEFAULT nextval('historico_cancelamentos_id_seq'::regclass),
    usuario_id INTEGER NOT NULL,
    data_cancelamento TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    motivo_cancelamento TEXT NOT NULL,
    tipo_cancelamento VARCHAR(20) NOT NULL DEFAULT 'voluntario'::character varying,
    observacoes TEXT,
    reativado_em TIMESTAMPTZ,
    data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text)
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('historico_cancelamentos_id_seq'::regclass) | - |
| usuario_id | integer(32,0) | - | NO | - | - |
| data_cancelamento | timestamp with time zone | - | NO | (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text) | - |
| motivo_cancelamento | text | - | NO | - | - |
| tipo_cancelamento | character varying(20) | 20 | NO | 'voluntario'::character varying | - |
| observacoes | text | - | YES | - | - |
| reativado_em | timestamp with time zone | - | YES | - | - |
| data_criacao | timestamp with time zone | - | YES | (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text) | - |

### Chave Primária

- id

### Chaves Estrangeiras

- **usuario_id** → usuarios.id (historico_cancelamentos_usuario_id_usuarios_id_fk)
### Constraints DDL

```sql
ALTER TABLE public.historico_cancelamentos ADD CONSTRAINT historico_cancelamentos_pkey PRIMARY KEY (id);
ALTER TABLE public.historico_cancelamentos ADD CONSTRAINT historico_cancelamentos_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
```


---

## Tabela: lembretes

### SQL DDL

```sql
CREATE TABLE public.lembretes (    id INTEGER NOT NULL DEFAULT nextval('lembretes_id_seq'::regclass),
    usuario_id INTEGER NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    data_lembrete TIMESTAMPTZ NOT NULL,
    data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    concluido BOOLEAN DEFAULT false
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('lembretes_id_seq'::regclass) | - |
| usuario_id | integer(32,0) | - | NO | - | - |
| titulo | character varying(255) | 255 | NO | - | - |
| descricao | text | - | YES | - | - |
| data_lembrete | timestamp with time zone | - | NO | - | - |
| data_criacao | timestamp with time zone | - | YES | (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text) | - |
| concluido | boolean | - | YES | false | - |

### Chave Primária

- id

### Chaves Estrangeiras

- **usuario_id** → usuarios.id (lembretes_usuario_id_usuarios_id_fk)
### Constraints DDL

```sql
ALTER TABLE public.lembretes ADD CONSTRAINT lembretes_pkey PRIMARY KEY (id);
ALTER TABLE public.lembretes ADD CONSTRAINT lembretes_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
```


---

## Tabela: transacoes

### SQL DDL

```sql
CREATE TABLE public.transacoes (    id INTEGER NOT NULL DEFAULT nextval('transacoes_id_seq'::regclass),
    carteira_id INTEGER NOT NULL,
    categoria_id INTEGER NOT NULL,
    forma_pagamento_id INTEGER,
    tipo VARCHAR(10) NOT NULL DEFAULT 'Despesa'::character varying,
    valor NUMERIC(12,2) NOT NULL,
    data_transacao DATE NOT NULL,
    data_registro TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    descricao VARCHAR(255) NOT NULL,
    metodo_pagamento VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'Pendente'::character varying
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('transacoes_id_seq'::regclass) | - |
| carteira_id | integer(32,0) | - | NO | - | - |
| categoria_id | integer(32,0) | - | NO | - | - |
| forma_pagamento_id | integer(32,0) | - | YES | - | - |
| tipo | character varying(10) | 10 | NO | 'Despesa'::character varying | - |
| valor | numeric(12,2) | - | NO | - | - |
| data_transacao | date | - | NO | - | - |
| data_registro | timestamp with time zone | - | YES | (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text) | - |
| descricao | character varying(255) | 255 | NO | - | - |
| metodo_pagamento | character varying(100) | 100 | YES | - | - |
| status | character varying(20) | 20 | NO | 'Pendente'::character varying | - |

### Chave Primária

- id

### Chaves Estrangeiras

- **carteira_id** → carteiras.id (transacoes_carteira_id_carteiras_id_fk)
- **categoria_id** → categorias.id (transacoes_categoria_id_categorias_id_fk)
- **forma_pagamento_id** → formas_pagamento.id (transacoes_forma_pagamento_id_formas_pagamento_id_fk)
### Constraints DDL

```sql
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_pkey PRIMARY KEY (id);
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_carteira_id_carteiras_id_fk FOREIGN KEY (carteira_id) REFERENCES carteiras(id);
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_categoria_id_categorias_id_fk FOREIGN KEY (categoria_id) REFERENCES categorias(id);
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_forma_pagamento_id_formas_pagamento_id_fk FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id);
```


---

## Tabela: user_sessions_admin

### SQL DDL

```sql
CREATE TABLE public.user_sessions_admin (    id INTEGER NOT NULL DEFAULT nextval('user_sessions_admin_id_seq'::regclass),
    super_admin_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    data_inicio TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    data_fim TIMESTAMPTZ,
    ativo BOOLEAN NOT NULL DEFAULT true
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('user_sessions_admin_id_seq'::regclass) | - |
| super_admin_id | integer(32,0) | - | NO | - | - |
| target_user_id | integer(32,0) | - | NO | - | - |
| data_inicio | timestamp with time zone | - | NO | (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text) | - |
| data_fim | timestamp with time zone | - | YES | - | - |
| ativo | boolean | - | NO | true | - |

### Chave Primária

- id

### Chaves Estrangeiras

- **super_admin_id** → usuarios.id (user_sessions_admin_super_admin_id_usuarios_id_fk)
- **target_user_id** → usuarios.id (user_sessions_admin_target_user_id_usuarios_id_fk)
### Constraints DDL

```sql
ALTER TABLE public.user_sessions_admin ADD CONSTRAINT user_sessions_admin_pkey PRIMARY KEY (id);
ALTER TABLE public.user_sessions_admin ADD CONSTRAINT user_sessions_admin_super_admin_id_usuarios_id_fk FOREIGN KEY (super_admin_id) REFERENCES usuarios(id);
ALTER TABLE public.user_sessions_admin ADD CONSTRAINT user_sessions_admin_target_user_id_usuarios_id_fk FOREIGN KEY (target_user_id) REFERENCES usuarios(id);
```


---

## Tabela: usuarios

### SQL DDL

```sql
CREATE TABLE public.usuarios (    id INTEGER NOT NULL DEFAULT nextval('usuarios_id_seq'::regclass),
    remotejid VARCHAR(255) NOT NULL DEFAULT ''::character varying,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    senha VARCHAR(255) NOT NULL,
    tipo_usuario VARCHAR(50) NOT NULL DEFAULT 'normal'::character varying,
    ativo BOOLEAN NOT NULL DEFAULT true,
    data_cadastro TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    ultimo_acesso TIMESTAMPTZ,
    data_cancelamento TIMESTAMPTZ,
    motivo_cancelamento TEXT,
    data_expiracao_assinatura TIMESTAMPTZ,
    status_assinatura VARCHAR(20) DEFAULT 'ativa'::character varying
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('usuarios_id_seq'::regclass) | - |
| remotejid | character varying(255) | 255 | NO | ''::character varying | - |
| nome | character varying(255) | 255 | NO | - | - |
| email | character varying(255) | 255 | NO | - | - |
| telefone | character varying(20) | 20 | YES | - | - |
| senha | character varying(255) | 255 | NO | - | - |
| tipo_usuario | character varying(50) | 50 | NO | 'normal'::character varying | - |
| ativo | boolean | - | NO | true | - |
| data_cadastro | timestamp with time zone | - | YES | (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text) | - |
| ultimo_acesso | timestamp with time zone | - | YES | - | - |
| data_cancelamento | timestamp with time zone | - | YES | - | - |
| motivo_cancelamento | text | - | YES | - | - |
| data_expiracao_assinatura | timestamp with time zone | - | YES | - | - |
| status_assinatura | character varying(20) | 20 | YES | 'ativa'::character varying | - |

### Chave Primária

- id

### Índices

- **usuarios_email_unique**  (UNIQUE): {email} (btree)
### Constraints DDL

```sql
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_email_unique UNIQUE (email);
```


---

## Tabela: waha_config

### SQL DDL

```sql
CREATE TABLE public.waha_config (    id INTEGER NOT NULL DEFAULT nextval('waha_config_id_seq'::regclass),
    waha_url TEXT NOT NULL,
    api_key TEXT,
    webhook_url TEXT,
    session_name VARCHAR(100) DEFAULT 'default'::character varying,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    webhook_hash VARCHAR(10)
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('waha_config_id_seq'::regclass) | - |
| waha_url | text | - | NO | - | - |
| api_key | text | - | YES | - | - |
| webhook_url | text | - | YES | - | - |
| session_name | character varying(100) | 100 | YES | 'default'::character varying | - |
| enabled | boolean | - | YES | true | - |
| created_at | timestamp without time zone | - | YES | now() | - |
| updated_at | timestamp without time zone | - | YES | now() | - |
| webhook_hash | character varying(10) | 10 | YES | - | - |

### Chave Primária

- id

### Índices

- **waha_config_webhook_hash_key**  (UNIQUE): {webhook_hash} (btree)
### Constraints DDL

```sql
ALTER TABLE public.waha_config ADD CONSTRAINT waha_config_pkey PRIMARY KEY (id);
ALTER TABLE public.waha_config ADD CONSTRAINT waha_config_webhook_hash_key UNIQUE (webhook_hash);
```


---

## Tabela: waha_session_webhooks

### SQL DDL

```sql
CREATE TABLE public.waha_session_webhooks (    id INTEGER NOT NULL DEFAULT nextval('waha_session_webhooks_id_seq'::regclass),
    session_name VARCHAR(255) NOT NULL,
    webhook_hash VARCHAR(10) NOT NULL,
    webhook_url TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('waha_session_webhooks_id_seq'::regclass) | - |
| session_name | character varying(255) | 255 | NO | - | - |
| webhook_hash | character varying(10) | 10 | NO | - | - |
| webhook_url | text | - | NO | - | - |
| enabled | boolean | - | YES | true | - |
| created_at | timestamp with time zone | - | YES | now() | - |
| updated_at | timestamp with time zone | - | YES | now() | - |

### Chave Primária

- id

### Índices

- **waha_session_webhooks_session_name_key**  (UNIQUE): {session_name} (btree)
- **waha_session_webhooks_webhook_hash_key**  (UNIQUE): {webhook_hash} (btree)
### Constraints DDL

```sql
ALTER TABLE public.waha_session_webhooks ADD CONSTRAINT waha_session_webhooks_pkey PRIMARY KEY (id);
ALTER TABLE public.waha_session_webhooks ADD CONSTRAINT waha_session_webhooks_session_name_key UNIQUE (session_name);
ALTER TABLE public.waha_session_webhooks ADD CONSTRAINT waha_session_webhooks_webhook_hash_key UNIQUE (webhook_hash);
```


---

## Tabela: welcome_messages

### SQL DDL

```sql
CREATE TABLE public.welcome_messages (    id INTEGER NOT NULL DEFAULT nextval('welcome_messages_id_seq'::regclass),
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    email_content TEXT,
    payment_link TEXT,
    send_email_welcome BOOLEAN DEFAULT true,
    send_email_activation BOOLEAN DEFAULT true,
    show_dashboard_message BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);
```

### Colunas

| Campo | Tipo | Tamanho | Nullable | Default | Comentário |
|-------|------|---------|----------|---------|------------|
| id | integer(32,0) | - | NO | nextval('welcome_messages_id_seq'::regclass) | - |
| type | character varying(50) | 50 | NO | - | - |
| title | text | - | NO | - | - |
| message | text | - | NO | - | - |
| email_content | text | - | YES | - | - |
| payment_link | text | - | YES | - | - |
| send_email_welcome | boolean | - | YES | true | - |
| send_email_activation | boolean | - | YES | true | - |
| show_dashboard_message | boolean | - | YES | true | - |
| created_at | timestamp without time zone | - | YES | now() | - |
| updated_at | timestamp without time zone | - | YES | now() | - |

### Chave Primária

- id

### Índices

- **welcome_messages_type_key**  (UNIQUE): {type} (btree)
### Constraints DDL

```sql
ALTER TABLE public.welcome_messages ADD CONSTRAINT welcome_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.welcome_messages ADD CONSTRAINT welcome_messages_type_key UNIQUE (type);
```


---

## Relacionamentos entre Tabelas

- **api_tokens.usuario_id** → **usuarios.id**
- **carteiras.usuario_id** → **usuarios.id**
- **categorias.usuario_id** → **usuarios.id**
- **formas_pagamento.usuario_id** → **usuarios.id**
- **historico_cancelamentos.usuario_id** → **usuarios.id**
- **lembretes.usuario_id** → **usuarios.id**
- **transacoes.carteira_id** → **carteiras.id**
- **transacoes.categoria_id** → **categorias.id**
- **transacoes.forma_pagamento_id** → **formas_pagamento.id**
- **user_sessions_admin.super_admin_id** → **usuarios.id**
- **user_sessions_admin.target_user_id** → **usuarios.id**

## Funções e Procedures

### armor

**Argumentos:** bytea
**Retorno:** text

```sql
pg_armor
```

### armor

**Argumentos:** bytea, text[], text[]
**Retorno:** text

```sql
pg_armor
```

### crypt

**Argumentos:** text, text
**Retorno:** text

```sql
pg_crypt
```

### dearmor

**Argumentos:** text
**Retorno:** bytea

```sql
pg_dearmor
```

### decrypt

**Argumentos:** bytea, bytea, text
**Retorno:** bytea

```sql
pg_decrypt
```

### decrypt_iv

**Argumentos:** bytea, bytea, bytea, text
**Retorno:** bytea

```sql
pg_decrypt_iv
```

### digest

**Argumentos:** bytea, text
**Retorno:** bytea

```sql
pg_digest
```

### digest

**Argumentos:** text, text
**Retorno:** bytea

```sql
pg_digest
```

### encrypt

**Argumentos:** bytea, bytea, text
**Retorno:** bytea

```sql
pg_encrypt
```

### encrypt_iv

**Argumentos:** bytea, bytea, bytea, text
**Retorno:** bytea

```sql
pg_encrypt_iv
```

### gen_random_bytes

**Argumentos:** integer
**Retorno:** bytea

```sql
pg_random_bytes
```

### gen_random_uuid

**Argumentos:** Nenhum
**Retorno:** uuid

```sql
pg_random_uuid
```

### gen_salt

**Argumentos:** text, integer
**Retorno:** text

```sql
pg_gen_salt_rounds
```

### gen_salt

**Argumentos:** text
**Retorno:** text

```sql
pg_gen_salt
```

### hmac

**Argumentos:** text, text, text
**Retorno:** bytea

```sql
pg_hmac
```

### hmac

**Argumentos:** bytea, bytea, text
**Retorno:** bytea

```sql
pg_hmac
```

### pgp_armor_headers

**Argumentos:** text, OUT key text, OUT value text
**Retorno:** SETOF record

```sql
pgp_armor_headers
```

### pgp_key_id

**Argumentos:** bytea
**Retorno:** text

```sql
pgp_key_id_w
```

### pgp_pub_decrypt

**Argumentos:** bytea, bytea, text
**Retorno:** text

```sql
pgp_pub_decrypt_text
```

### pgp_pub_decrypt

**Argumentos:** bytea, bytea
**Retorno:** text

```sql
pgp_pub_decrypt_text
```

### pgp_pub_decrypt

**Argumentos:** bytea, bytea, text, text
**Retorno:** text

```sql
pgp_pub_decrypt_text
```

### pgp_pub_decrypt_bytea

**Argumentos:** bytea, bytea, text
**Retorno:** bytea

```sql
pgp_pub_decrypt_bytea
```

### pgp_pub_decrypt_bytea

**Argumentos:** bytea, bytea, text, text
**Retorno:** bytea

```sql
pgp_pub_decrypt_bytea
```

### pgp_pub_decrypt_bytea

**Argumentos:** bytea, bytea
**Retorno:** bytea

```sql
pgp_pub_decrypt_bytea
```

### pgp_pub_encrypt

**Argumentos:** text, bytea
**Retorno:** bytea

```sql
pgp_pub_encrypt_text
```

### pgp_pub_encrypt

**Argumentos:** text, bytea, text
**Retorno:** bytea

```sql
pgp_pub_encrypt_text
```

### pgp_pub_encrypt_bytea

**Argumentos:** bytea, bytea, text
**Retorno:** bytea

```sql
pgp_pub_encrypt_bytea
```

### pgp_pub_encrypt_bytea

**Argumentos:** bytea, bytea
**Retorno:** bytea

```sql
pgp_pub_encrypt_bytea
```

### pgp_sym_decrypt

**Argumentos:** bytea, text
**Retorno:** text

```sql
pgp_sym_decrypt_text
```

### pgp_sym_decrypt

**Argumentos:** bytea, text, text
**Retorno:** text

```sql
pgp_sym_decrypt_text
```

### pgp_sym_decrypt_bytea

**Argumentos:** bytea, text, text
**Retorno:** bytea

```sql
pgp_sym_decrypt_bytea
```

### pgp_sym_decrypt_bytea

**Argumentos:** bytea, text
**Retorno:** bytea

```sql
pgp_sym_decrypt_bytea
```

### pgp_sym_encrypt

**Argumentos:** text, text, text
**Retorno:** bytea

```sql
pgp_sym_encrypt_text
```

### pgp_sym_encrypt

**Argumentos:** text, text
**Retorno:** bytea

```sql
pgp_sym_encrypt_text
```

### pgp_sym_encrypt_bytea

**Argumentos:** bytea, text, text
**Retorno:** bytea

```sql
pgp_sym_encrypt_bytea
```

### pgp_sym_encrypt_bytea

**Argumentos:** bytea, text
**Retorno:** bytea

```sql
pgp_sym_encrypt_bytea
```


## Script de Migration Completo

Script SQL completo para recriar toda a estrutura do banco:

```sql
-- Script de Migration - Banco de Dados Financeiro
-- Gerado automaticamente em: 2025-10-02T15:17:17.185Z

-- EXTENSÕES NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- Tabela: api_tokens
CREATE TABLE public.api_tokens (    id INTEGER NOT NULL DEFAULT nextval('api_tokens_id_seq'::regclass),
    usuario_id INTEGER NOT NULL,
    token VARCHAR(255) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    data_expiracao TIMESTAMPTZ,
    ativo BOOLEAN NOT NULL DEFAULT true,
    master BOOLEAN NOT NULL DEFAULT false,
    rotacionavel BOOLEAN NOT NULL DEFAULT false
);


-- Tabela: carteiras
CREATE TABLE public.carteiras (    id INTEGER NOT NULL DEFAULT nextval('carteiras_id_seq'::regclass),
    usuario_id INTEGER NOT NULL,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    saldo_atual NUMERIC(12,2) DEFAULT 0.00,
    data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text)
);


-- Tabela: categorias
CREATE TABLE public.categorias (    id INTEGER NOT NULL DEFAULT nextval('categorias_id_seq'::regclass),
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(10) NOT NULL DEFAULT 'Despesa'::character varying,
    cor VARCHAR(50),
    icone VARCHAR(100),
    descricao TEXT,
    usuario_id INTEGER,
    global BOOLEAN NOT NULL DEFAULT false
);


-- Tabela: formas_pagamento
CREATE TABLE public.formas_pagamento (    id INTEGER NOT NULL DEFAULT nextval('formas_pagamento_id_seq'::regclass),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    icone VARCHAR(100),
    cor VARCHAR(50),
    usuario_id INTEGER,
    global BOOLEAN NOT NULL DEFAULT false,
    ativo BOOLEAN NOT NULL DEFAULT true,
    data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text)
);


-- Tabela: historico_cancelamentos
CREATE TABLE public.historico_cancelamentos (    id INTEGER NOT NULL DEFAULT nextval('historico_cancelamentos_id_seq'::regclass),
    usuario_id INTEGER NOT NULL,
    data_cancelamento TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    motivo_cancelamento TEXT NOT NULL,
    tipo_cancelamento VARCHAR(20) NOT NULL DEFAULT 'voluntario'::character varying,
    observacoes TEXT,
    reativado_em TIMESTAMPTZ,
    data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text)
);


-- Tabela: lembretes
CREATE TABLE public.lembretes (    id INTEGER NOT NULL DEFAULT nextval('lembretes_id_seq'::regclass),
    usuario_id INTEGER NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    data_lembrete TIMESTAMPTZ NOT NULL,
    data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    concluido BOOLEAN DEFAULT false
);


-- Tabela: transacoes
CREATE TABLE public.transacoes (    id INTEGER NOT NULL DEFAULT nextval('transacoes_id_seq'::regclass),
    carteira_id INTEGER NOT NULL,
    categoria_id INTEGER NOT NULL,
    forma_pagamento_id INTEGER,
    tipo VARCHAR(10) NOT NULL DEFAULT 'Despesa'::character varying,
    valor NUMERIC(12,2) NOT NULL,
    data_transacao DATE NOT NULL,
    data_registro TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    descricao VARCHAR(255) NOT NULL,
    metodo_pagamento VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'Pendente'::character varying
);


-- Tabela: user_sessions_admin
CREATE TABLE public.user_sessions_admin (    id INTEGER NOT NULL DEFAULT nextval('user_sessions_admin_id_seq'::regclass),
    super_admin_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    data_inicio TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    data_fim TIMESTAMPTZ,
    ativo BOOLEAN NOT NULL DEFAULT true
);


-- Tabela: usuarios
CREATE TABLE public.usuarios (    id INTEGER NOT NULL DEFAULT nextval('usuarios_id_seq'::regclass),
    remotejid VARCHAR(255) NOT NULL DEFAULT ''::character varying,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    senha VARCHAR(255) NOT NULL,
    tipo_usuario VARCHAR(50) NOT NULL DEFAULT 'normal'::character varying,
    ativo BOOLEAN NOT NULL DEFAULT true,
    data_cadastro TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'::text),
    ultimo_acesso TIMESTAMPTZ,
    data_cancelamento TIMESTAMPTZ,
    motivo_cancelamento TEXT,
    data_expiracao_assinatura TIMESTAMPTZ,
    status_assinatura VARCHAR(20) DEFAULT 'ativa'::character varying
);


-- Tabela: waha_config
CREATE TABLE public.waha_config (    id INTEGER NOT NULL DEFAULT nextval('waha_config_id_seq'::regclass),
    waha_url TEXT NOT NULL,
    api_key TEXT,
    webhook_url TEXT,
    session_name VARCHAR(100) DEFAULT 'default'::character varying,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    webhook_hash VARCHAR(10)
);


-- Tabela: waha_session_webhooks
CREATE TABLE public.waha_session_webhooks (    id INTEGER NOT NULL DEFAULT nextval('waha_session_webhooks_id_seq'::regclass),
    session_name VARCHAR(255) NOT NULL,
    webhook_hash VARCHAR(10) NOT NULL,
    webhook_url TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- Tabela: welcome_messages
CREATE TABLE public.welcome_messages (    id INTEGER NOT NULL DEFAULT nextval('welcome_messages_id_seq'::regclass),
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    email_content TEXT,
    payment_link TEXT,
    send_email_welcome BOOLEAN DEFAULT true,
    send_email_activation BOOLEAN DEFAULT true,
    show_dashboard_message BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);


-- CONSTRAINTS
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.carteiras ADD CONSTRAINT carteiras_pkey PRIMARY KEY (id);
ALTER TABLE public.categorias ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);
ALTER TABLE public.formas_pagamento ADD CONSTRAINT formas_pagamento_pkey PRIMARY KEY (id);
ALTER TABLE public.historico_cancelamentos ADD CONSTRAINT historico_cancelamentos_pkey PRIMARY KEY (id);
ALTER TABLE public.lembretes ADD CONSTRAINT lembretes_pkey PRIMARY KEY (id);
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_pkey PRIMARY KEY (id);
ALTER TABLE public.user_sessions_admin ADD CONSTRAINT user_sessions_admin_pkey PRIMARY KEY (id);
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);
ALTER TABLE public.waha_config ADD CONSTRAINT waha_config_pkey PRIMARY KEY (id);
ALTER TABLE public.waha_session_webhooks ADD CONSTRAINT waha_session_webhooks_pkey PRIMARY KEY (id);
ALTER TABLE public.welcome_messages ADD CONSTRAINT welcome_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_token_unique UNIQUE (token);
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_usuario_id_master_unique UNIQUE (usuario_id, master);
ALTER TABLE public.categorias ADD CONSTRAINT categorias_nome_global_unique UNIQUE (nome, global);
ALTER TABLE public.formas_pagamento ADD CONSTRAINT formas_pagamento_nome_global_unique UNIQUE (nome, global);
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_email_unique UNIQUE (email);
ALTER TABLE public.waha_config ADD CONSTRAINT waha_config_webhook_hash_key UNIQUE (webhook_hash);
ALTER TABLE public.waha_session_webhooks ADD CONSTRAINT waha_session_webhooks_session_name_key UNIQUE (session_name);
ALTER TABLE public.waha_session_webhooks ADD CONSTRAINT waha_session_webhooks_webhook_hash_key UNIQUE (webhook_hash);
ALTER TABLE public.welcome_messages ADD CONSTRAINT welcome_messages_type_key UNIQUE (type);
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE public.carteiras ADD CONSTRAINT carteiras_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE public.categorias ADD CONSTRAINT categorias_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE public.formas_pagamento ADD CONSTRAINT formas_pagamento_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE public.historico_cancelamentos ADD CONSTRAINT historico_cancelamentos_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE public.lembretes ADD CONSTRAINT lembretes_usuario_id_usuarios_id_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_carteira_id_carteiras_id_fk FOREIGN KEY (carteira_id) REFERENCES carteiras(id);
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_categoria_id_categorias_id_fk FOREIGN KEY (categoria_id) REFERENCES categorias(id);
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_forma_pagamento_id_formas_pagamento_id_fk FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id);
ALTER TABLE public.user_sessions_admin ADD CONSTRAINT user_sessions_admin_super_admin_id_usuarios_id_fk FOREIGN KEY (super_admin_id) REFERENCES usuarios(id);
ALTER TABLE public.user_sessions_admin ADD CONSTRAINT user_sessions_admin_target_user_id_usuarios_id_fk FOREIGN KEY (target_user_id) REFERENCES usuarios(id);

-- ÍNDICES
CREATE INDEX pg_auth_members_grantor_index ON public.pg_auth_members USING btree (grantor);
CREATE INDEX pg_class_tblspc_relfilenode_index ON public.pg_class USING btree (reltablespace, relfilenode);
CREATE INDEX pg_constraint_conname_nsp_index ON public.pg_constraint USING btree (conname, connamespace);
CREATE INDEX pg_constraint_conparentid_index ON public.pg_constraint USING btree (conparentid);
CREATE INDEX pg_constraint_contypid_index ON public.pg_constraint USING btree (contypid);
CREATE INDEX pg_depend_depender_index ON public.pg_depend USING btree (classid, objid, objsubid);
CREATE INDEX pg_depend_reference_index ON public.pg_depend USING btree (refclassid, refobjid, refobjsubid);
CREATE INDEX pg_index_indrelid_index ON public.pg_index USING btree (indrelid);
CREATE INDEX pg_inherits_parent_index ON public.pg_inherits USING btree (inhparent);
CREATE INDEX pg_publication_rel_prpubid_index ON public.pg_publication_rel USING btree (prpubid);
CREATE INDEX pg_shdepend_depender_index ON public.pg_shdepend USING btree (dbid, classid, objid, objsubid);
CREATE INDEX pg_shdepend_reference_index ON public.pg_shdepend USING btree (refclassid, refobjid);
CREATE INDEX pg_statistic_ext_relid_index ON public.pg_statistic_ext USING btree (stxrelid);
CREATE INDEX pg_trigger_tgconstraint_index ON public.pg_trigger USING btree (tgconstraint);
```

