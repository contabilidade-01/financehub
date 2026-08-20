import { Request, Response } from "express";
import {
  storage,
  getContasBancariasByEmpresa,
  getContaBancariaById,
  createContaBancaria,
  updateContaBancaria,
  deleteContaBancaria,
  getSaldoSistemaConta,
  getMovimentos,
  getMovimentoById,
  updateMovimento,
  lancarMovimentoComoTransacao,
  conciliarMovimentoComTransacao,
  aprenderMemoriaContaPJ,
  getUltimoSaldoInformado,
} from "../storage";
import { processarImportacaoOfx } from "../services/conciliacao.service";

// Garante que a empresa é do usuário logado (isolamento).
async function empresaDoUsuario(req: Request, res: Response): Promise<any | null> {
  const empresaId = Number(req.params.id);
  const emp = await storage.getEmpresaById(empresaId);
  if (!emp || emp.usuario_id !== (req as any).user?.id) {
    res.status(404).json({ error: "Empresa não encontrada" });
    return null;
  }
  return emp;
}

// Garante que a conta bancária pertence à empresa do usuário.
async function contaDaEmpresa(contaId: number, empresaId: number, res: Response): Promise<any | null> {
  const conta = await getContaBancariaById(contaId);
  if (!conta || conta.empresa_id !== empresaId) {
    res.status(404).json({ error: "Conta bancária não encontrada" });
    return null;
  }
  return conta;
}

export class ConciliacaoController {
  // ---- Contas bancárias ----
  static async listarContas(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const contas = await getContasBancariasByEmpresa(emp.id);
    const comSaldo = await Promise.all(contas.map(async (c: any) => ({ ...c, saldo_sistema: await getSaldoSistemaConta(c.id) })));
    res.json(comSaldo);
  }
  static async criarConta(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const b = req.body || {};
    if (!b.banco) return res.status(400).json({ error: "banco é obrigatório" });
    const conta = await createContaBancaria({ ...b, empresa_id: emp.id, usuario_id: (req as any).user.id });
    res.status(201).json(conta);
  }
  static async atualizarConta(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const conta = await contaDaEmpresa(Number(req.params.contaId), emp.id, res); if (!conta) return;
    res.json(await updateContaBancaria(conta.id, req.body || {}));
  }
  static async removerConta(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const conta = await contaDaEmpresa(Number(req.params.contaId), emp.id, res); if (!conta) return;
    await deleteContaBancaria(conta.id);
    res.json({ success: true });
  }

  // ---- Importação OFX ----
  static async importar(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const contaBancariaId = Number(req.body?.conta_bancaria_id);
    const conta = await contaDaEmpresa(contaBancariaId, emp.id, res); if (!conta) return;
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "Envie o arquivo OFX no campo 'arquivo'." });
    // OFX pode vir em latin1; tenta utf8 e cai para latin1 se houver caractere inválido.
    let conteudo = file.buffer.toString("utf8");
    if (/�/.test(conteudo)) conteudo = file.buffer.toString("latin1");
    try {
      const resultado = await processarImportacaoOfx({
        empresaId: emp.id, contaBancariaId, usuarioId: (req as any).user.id,
        arquivoNome: file.originalname, conteudo,
      });
      res.json(resultado);
    } catch (e: any) {
      console.error("[Conciliação] erro ao importar:", e?.message);
      res.status(500).json({ error: "Falha ao processar o extrato", detalhe: e?.message });
    }
  }

  // ---- Movimentos ----
  static async listarMovimentos(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const importacaoId = req.query.importacao_id ? Number(req.query.importacao_id) : undefined;
    const contaBancariaId = req.query.conta_bancaria_id ? Number(req.query.conta_bancaria_id) : undefined;
    const status = req.query.status as string | undefined;
    const movs = await getMovimentos({ importacaoId, contaBancariaId, status });
    // isolamento: só movimentos da empresa
    res.json(movs.filter((m: any) => m.empresa_id === emp.id));
  }

  // Lança um movimento (cria transação PJ na conta contábil escolhida) + aprende.
  static async lancar(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const mov = await getMovimentoById(Number(req.params.mid));
    if (!mov || mov.empresa_id !== emp.id) return res.status(404).json({ error: "Movimento não encontrado" });
    const contaContabilId = Number(req.body?.conta_contabil_id);
    if (!contaContabilId) return res.status(400).json({ error: "Informe conta_contabil_id" });
    const tx = await lancarMovimentoComoTransacao(mov, contaContabilId);
    // Aprende: essa descrição -> essa conta (para as próximas importações)
    const contas = await storage.getEmpresasContasByEmpresaId(emp.id) as any[];
    const nome = contas.find((c: any) => c.id === contaContabilId)?.nome;
    await aprenderMemoriaContaPJ((req as any).user.id, mov.descricao || "", contaContabilId, nome);
    res.json({ success: true, transacao: tx });
  }

  // Concilia um movimento a uma transação existente.
  static async conciliar(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const mov = await getMovimentoById(Number(req.params.mid));
    if (!mov || mov.empresa_id !== emp.id) return res.status(404).json({ error: "Movimento não encontrado" });
    const txId = Number(req.body?.transacao_id) || mov.transacao_id;
    if (!txId) return res.status(400).json({ error: "Informe transacao_id" });
    await conciliarMovimentoComTransacao(mov.id, txId);
    res.json({ success: true });
  }

  static async ignorar(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const mov = await getMovimentoById(Number(req.params.mid));
    if (!mov || mov.empresa_id !== emp.id) return res.status(404).json({ error: "Movimento não encontrado" });
    await updateMovimento(mov.id, { status: "ignorado" });
    res.json({ success: true });
  }

  // Em lote: aceita todas as sugestões pendentes de uma importação.
  static async aceitarSugestoes(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const importacaoId = Number(req.body?.importacao_id);
    if (!importacaoId) return res.status(400).json({ error: "Informe importacao_id" });
    const movs = await getMovimentos({ importacaoId, status: "pendente" });
    let n = 0;
    for (const mov of movs) {
      if (mov.empresa_id !== emp.id || !mov.sugestao_conta_id) continue;
      await lancarMovimentoComoTransacao(mov, mov.sugestao_conta_id);
      const contas = await storage.getEmpresasContasByEmpresaId(emp.id) as any[];
      const nome = contas.find((c: any) => c.id === mov.sugestao_conta_id)?.nome;
      await aprenderMemoriaContaPJ((req as any).user.id, mov.descricao || "", mov.sugestao_conta_id, nome);
      n++;
    }
    res.json({ success: true, lancados: n });
  }

  // Bater saldo: saldo do sistema vs saldo informado no extrato.
  static async baterSaldo(req: Request, res: Response) {
    const emp = await empresaDoUsuario(req, res); if (!emp) return;
    const conta = await contaDaEmpresa(Number(req.query.conta_bancaria_id), emp.id, res); if (!conta) return;
    const saldoSistema = await getSaldoSistemaConta(conta.id);
    const imports = await getMovimentos({ contaBancariaId: conta.id });
    // último saldo informado (da importação mais recente)
    const ultimaImport = await getUltimoSaldoInformado(conta.id);
    const saldoExtrato = ultimaImport != null ? Number(ultimaImport) : null;
    const diferenca = saldoExtrato != null ? Math.round((saldoSistema - saldoExtrato) * 100) / 100 : null;
    res.json({
      saldo_sistema: saldoSistema,
      saldo_extrato: saldoExtrato,
      diferenca,
      bate: diferenca != null ? Math.abs(diferenca) < 0.01 : null,
      pendentes: imports.filter((m: any) => m.status === "pendente").length,
    });
  }
}
