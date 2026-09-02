CREATE TABLE "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"token" varchar(255) NOT NULL,
	"nome" varchar(100) NOT NULL,
	"descricao" text,
	"data_criacao" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
	"data_expiracao" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL,
	"master" boolean DEFAULT false NOT NULL,
	"rotacionavel" boolean DEFAULT false NOT NULL,
	CONSTRAINT "api_tokens_token_unique" UNIQUE("token"),
	CONSTRAINT "api_tokens_usuario_id_master_unique" UNIQUE("usuario_id","master")
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" varchar(255) NOT NULL,
	"tipo" varchar(10) DEFAULT 'Despesa' NOT NULL,
	"cor" varchar(50),
	"icone" varchar(100),
	"descricao" text,
	"usuario_id" integer,
	"global" boolean DEFAULT false NOT NULL,
	CONSTRAINT "categorias_nome_global_unique" UNIQUE("nome","global")
);
--> statement-breakpoint
CREATE TABLE "historico_cancelamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"data_cancelamento" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') NOT NULL,
	"motivo_cancelamento" text NOT NULL,
	"tipo_cancelamento" varchar(20) DEFAULT 'voluntario' NOT NULL,
	"observacoes" text,
	"reativado_em" timestamp with time zone,
	"data_criacao" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
);
--> statement-breakpoint
CREATE TABLE "formas_pagamento" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" varchar(255) NOT NULL,
	"descricao" text,
	"icone" varchar(100),
	"cor" varchar(50),
	"usuario_id" integer,
	"global" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"data_criacao" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
	CONSTRAINT "formas_pagamento_nome_global_unique" UNIQUE("nome","global")
);
--> statement-breakpoint
CREATE TABLE "lembretes" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"data_lembrete" timestamp with time zone NOT NULL,
	"data_criacao" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
	"concluido" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "transacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"carteira_id" integer NOT NULL,
	"categoria_id" integer NOT NULL,
	"forma_pagamento_id" integer,
	"tipo" varchar(10) DEFAULT 'Despesa' NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"data_transacao" date NOT NULL,
	"data_registro" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
	"descricao" varchar(255) NOT NULL,
	"metodo_pagamento" varchar(100),
	"status" varchar(20) DEFAULT 'Pendente' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions_admin" (
	"id" serial PRIMARY KEY NOT NULL,
	"super_admin_id" integer NOT NULL,
	"target_user_id" integer NOT NULL,
	"data_inicio" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') NOT NULL,
	"data_fim" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"remotejid" varchar(255) DEFAULT '' NOT NULL,
	"nome" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"telefone" varchar(20),
	"senha" varchar(255) NOT NULL,
	"tipo_usuario" varchar(50) DEFAULT 'normal' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"data_cadastro" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
	"ultimo_acesso" timestamp with time zone,
	"data_cancelamento" timestamp with time zone,
	"motivo_cancelamento" text,
	"data_expiracao_assinatura" timestamp with time zone,
	"status_assinatura" varchar(50) DEFAULT 'sem_assinatura',
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "carteiras" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"descricao" text,
	"saldo_atual" numeric(12, 2) DEFAULT '0.00',
	"data_criacao" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_cancelamentos" ADD CONSTRAINT "historico_cancelamentos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lembretes" ADD CONSTRAINT "lembretes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_carteira_id_carteiras_id_fk" FOREIGN KEY ("carteira_id") REFERENCES "public"."carteiras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_forma_pagamento_id_formas_pagamento_id_fk" FOREIGN KEY ("forma_pagamento_id") REFERENCES "public"."formas_pagamento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions_admin" ADD CONSTRAINT "user_sessions_admin_super_admin_id_usuarios_id_fk" FOREIGN KEY ("super_admin_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions_admin" ADD CONSTRAINT "user_sessions_admin_target_user_id_usuarios_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carteiras" ADD CONSTRAINT "carteiras_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;