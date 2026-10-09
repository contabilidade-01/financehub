import { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { insertEmpresaContaSchema, updateEmpresaContaSchema } from "../../shared/schema";
import { classificacaoDoGrupo, proximoCodigoFilho } from "../services/plano-contas-pj";

/**
 * Controller: empresaConta
 * CRUD do plano de contas PJ (empresas_contas) por empresa.
 * Verifica que a empresa pertence ao usuário logado antes de qualquer operação.
 *
 * Plano em árvore: grupos sintéticos (só somam) e contas analíticas (recebem
 * lançamento). A listagem padrão devolve só as analíticas ativas, que é o que
 * todo select de lançamento precisa; `?arvore=1` devolve o plano inteiro.
 */

// Helpers
const resolveEmpresa = async (empresaId: number, userId: number, res: Response) => {
  const empresa = await storage.getEmpresaById(empresaId);
  if (!empresa) { res.status(404).json({ error: "Empresa não encontrada." }); return null; }
  if (empresa.usuario_id !== userId) { res.status(403).json({ error: "Acesso negado." }); return null; }
  return empresa;
};

const erro = (res: Response, err: any, ctx: string) => {
  if (err?.status === 400) return res.status(400).json({ error: err.message });
  if (err?.code === "23505") return res.status(409).json({ error: "Código já existe nesta empresa." });
  console.error(`${ctx}:`, err);
  return res.status(500).json({ error: "Erro interno." });
};

async function qtdLancamentos(contaId: number): Promise<number> {
  const r = await db.execute(sql`SELECT COUNT(*)::int AS n FROM empresas_transacoes WHERE categoria_id = ${contaId}`);
  return Number((r as any[])[0]?.n || 0);
}

// GET /api/empresas/:id/contas[?arvore=1]
export const listEmpresasContas = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    if (req.query.arvore === "1") {
      const contas = await storage.getPlanoContasCompleto(empresaId);
      const uso = await db.execute(sql`
        SELECT categoria_id, COUNT(*)::int AS n FROM empresas_transacoes
        WHERE empresa_id = ${empresaId} GROUP BY categoria_id
      `);
      const n = new Map((uso as any[]).map((r) => [Number(r.categoria_id), Number(r.n)]));
      return res.json(contas.map((c) => ({ ...c, lancamentos: n.get(c.id) || 0 })));
    }

    const contas = await storage.getEmpresasContasByEmpresaId(empresaId);
    return res.json(contas);
  } catch (err) {
    return erro(res, err, "listEmpresasContas");
  }
};

// POST /api/empresas/:id/contas
export const createEmpresaConta = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const parsed = insertEmpresaContaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
    }

    const conta = await storage.createEmpresaConta({ ...parsed.data, empresa_id: empresaId });
    return res.status(201).json(conta);
  } catch (err: any) {
    return erro(res, err, "createEmpresaConta");
  }
};

// POST /api/empresas/:id/contas/completar-modelo { modelo: "servicos" | "comercio" }
export const completarComModelo = async (req: Request, res: Response) => {
  try {
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });
    const empresa = await resolveEmpresa(empresaId, req.user!.id, res);
    if (!empresa) return;
    const modelo = req.body?.modelo === "servicos" ? "servicos" : req.body?.modelo === "comercio" ? "comercio" : null;
    if (!modelo) return res.status(400).json({ error: "Escolha o modelo: servicos ou comercio." });
    const r = await storage.completarPlanoComModelo(empresaId, modelo);
    return res.json(r);
  } catch (err: any) {
    return erro(res, err, "completarComModelo");
  }
};

// PUT /api/empresas/:id/contas/:contaId
export const updateEmpresaConta = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    const contaId = parseInt(req.params.contaId);
    if (isNaN(empresaId) || isNaN(contaId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const conta = await storage.getEmpresaContaById(contaId);
    if (!conta) return res.status(404).json({ error: "Conta não encontrada." });
    if (conta.empresa_id !== empresaId) return res.status(403).json({ error: "Conta não pertence a esta empresa." });

    const parsed = updateEmpresaContaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
    }
    const dados: any = { ...parsed.data };
    delete dados.empresa_id;

    if (dados.sintetica === true && !conta.sintetica && (await qtdLancamentos(contaId)) > 0) {
      return res.status(400).json({ error: "Esta conta já tem lançamentos; não pode virar grupo." });
    }

    // Mover de grupo: o novo pai precisa ser grupo desta empresa e não pode ser
    // a própria conta nem uma descendente dela. Sem código informado, a conta
    // ganha o próximo código do grupo de destino.
    if (dados.parent_id !== undefined && dados.parent_id !== conta.parent_id) {
      const plano = await storage.getPlanoContasCompleto(empresaId);
      if (dados.parent_id !== null) {
        const pai = plano.find((c) => c.id === dados.parent_id);
        if (!pai || !pai.sintetica) return res.status(400).json({ error: "Escolha um grupo do plano de contas." });
        let cursor: typeof pai | undefined = pai;
        while (cursor) {
          if (cursor.id === contaId) return res.status(400).json({ error: "Um grupo não pode ficar dentro dele mesmo." });
          cursor = cursor.parent_id ? plano.find((c) => c.id === cursor!.parent_id) : undefined;
        }
        if (!dados.codigo) dados.codigo = proximoCodigoFilho(plano.filter((c) => c.id !== contaId), pai.codigo);
        if (dados.grupo_gerencial === undefined) dados.grupo_gerencial = pai.grupo_gerencial;
      }
    }

    const updated = await storage.updateEmpresaConta(contaId, dados);

    // Grupo mudou de comportamento na DRE: as contas de dentro acompanham.
    if (conta.sintetica && dados.grupo_gerencial && dados.grupo_gerencial !== conta.grupo_gerencial) {
      await db.execute(sql`
        UPDATE empresas_contas
        SET grupo_gerencial = ${dados.grupo_gerencial},
            classificacao = ${classificacaoDoGrupo(dados.grupo_gerencial)},
            is_cmv = CASE WHEN ${dados.grupo_gerencial} = 'custo_variavel' THEN is_cmv ELSE false END
        WHERE parent_id = ${contaId} AND empresa_id = ${empresaId}
      `);
    }
    return res.json(updated);
  } catch (err: any) {
    return erro(res, err, "updateEmpresaConta");
  }
};

// DELETE /api/empresas/:id/contas/:contaId
// Conta com lançamentos é inativada (some dos selects, continua nos relatórios).
export const deleteEmpresaConta = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    const contaId = parseInt(req.params.contaId);
    if (isNaN(empresaId) || isNaN(contaId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const conta = await storage.getEmpresaContaById(contaId);
    if (!conta) return res.status(404).json({ error: "Conta não encontrada." });
    if (conta.empresa_id !== empresaId) return res.status(403).json({ error: "Conta não pertence a esta empresa." });

    const filhas = await db.execute(sql`SELECT COUNT(*)::int AS n FROM empresas_contas WHERE parent_id = ${contaId} AND ativo = true`);
    if (Number((filhas as any[])[0]?.n || 0) > 0) {
      return res.status(400).json({ error: "Mova ou exclua as contas deste grupo antes." });
    }

    if ((await qtdLancamentos(contaId)) > 0) {
      await storage.updateEmpresaConta(contaId, { ativo: false } as any);
      return res.json({ inativado: true });
    }

    const deleted = await storage.deleteEmpresaConta(contaId);
    if (!deleted) {
      await storage.updateEmpresaConta(contaId, { ativo: false } as any);
      return res.json({ inativado: true });
    }
    return res.status(204).send();
  } catch (err) {
    return erro(res, err, "deleteEmpresaConta");
  }
};
