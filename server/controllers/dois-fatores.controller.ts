import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { storage } from "../storage";
import {
  ativarDoisFatores,
  conferirSegundoFator,
  desativarDoisFatores,
  iniciarConfiguracao,
  navegadorConfiavel,
  novosCodigosRecuperacao,
  statusDoisFatores,
  tokenNavegadorConfiavel,
} from "../services/dois-fatores.service";
import { DIAS_NAVEGADOR_CONFIAVEL } from "../services/dois-fatores-logic";
import { flagAtiva, FLAG_DOIS_FATORES } from "../services/feature-flags.service";
import { registrarFalhaLogin, registrarSucessoLogin } from "../utils/login-lockout";

const EMISSOR = "Tudo Contado";
/** Tempo para digitar o código depois de acertar a senha. */
export const PRAZO_SEGUNDO_FATOR_MS = 5 * 60 * 1000;
/** Tentativas de código por login (além do limite por IP da rota). */
const MAX_TENTATIVAS = 5;

/** 2FA é só para administradores; clientes continuam entrando só com a senha. */
export const PAPEIS_COM_2FA = ["super_admin", "admin"];

export const COOKIE_NAVEGADOR = "tc_2fa_nav";

function lerCookie(req: Request, nome: string): string | null {
  for (const parte of String(req.headers.cookie || "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

/** Login: este navegador já foi lembrado (30 dias) para esta conta? */
export async function navegadorLembrado(req: Request, userId: number): Promise<boolean> {
  try {
    return await navegadorConfiavel(userId, lerCookie(req, COOKIE_NAVEGADOR));
  } catch {
    return false;
  }
}

type Pendente = { userId: number; email: string; exp: number; tentativas: number };

/** Chamado pelo login quando a senha está certa e a conta tem 2FA: sessão ainda sem userId. */
export function marcarSegundoFatorPendente(req: Request, userId: number, email: string): void {
  (req.session as any).doisFatoresPendente = {
    userId,
    email,
    exp: Date.now() + PRAZO_SEGUNDO_FATOR_MS,
    tentativas: 0,
  } satisfies Pendente;
}

// POST /api/auth/2fa/verificar  { codigo }  — segunda etapa do login
export async function verificarLogin(req: Request, res: Response) {
  const p = (req.session as any).doisFatoresPendente as Pendente | undefined;
  if (!p || p.exp < Date.now()) {
    delete (req.session as any).doisFatoresPendente;
    return res.status(401).json({ message: "O tempo para digitar o código acabou. Entre com e-mail e senha de novo." });
  }
  if (p.tentativas >= MAX_TENTATIVAS) {
    delete (req.session as any).doisFatoresPendente;
    return res.status(401).json({ message: "Muitas tentativas. Entre com e-mail e senha de novo." });
  }
  const ok = await conferirSegundoFator(p.userId, req.body?.codigo);
  if (!ok) {
    p.tentativas++;
    (req.session as any).doisFatoresPendente = p;
    registrarFalhaLogin(p.email);
    return res.status(401).json({ message: "Código inválido." });
  }
  const user = await storage.getUserById(p.userId);
  if (!user) return res.status(401).json({ message: "Usuário não encontrado." });

  await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  (req.session as any).userId = user.id;
  await storage.updateUser(user.id, { ultimo_acesso: new Date() } as any);
  registrarSucessoLogin(p.email);
  console.log(`[2FA] login concluído user=${user.id} via=${ok.via}`);

  // "Lembrar este navegador": não pede o código de novo por 30 dias neste navegador.
  if (req.body?.lembrar === true) {
    const token = await tokenNavegadorConfiavel(user.id);
    if (token) {
      res.cookie(COOKIE_NAVEGADOR, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/auth",
        maxAge: DIAS_NAVEGADOR_CONFIAVEL * 24 * 60 * 60 * 1000,
      });
    }
  }

  const { senha, ...semSenha } = user as any;
  return res.json({ user: semSenha, via: ok.via, codigos_restantes: ok.codigos_restantes });
}

// ---- Configuração (usuário logado) ----

async function podeConfigurar(req: Request, res: Response): Promise<boolean> {
  if ((req as any).originalUser || (req as any).isImpersonating) {
    res.status(403).json({ error: "Não é possível alterar a verificação em duas etapas acessando como outro usuário." });
    return false;
  }
  const u = req.user as any;
  if (u?.tipo_usuario === "super_admin") return true;
  if (u?.tipo_usuario === "admin" && (await flagAtiva(FLAG_DOIS_FATORES, u?.id))) return true;
  res.status(404).json({ error: "Recurso indisponível." });
  return false;
}

// GET /api/auth/2fa
export async function status(req: Request, res: Response) {
  try {
    if (!(await podeConfigurar(req, res))) return;
    return res.json(await statusDoisFatores(req.user!.id));
  } catch (e: any) {
    console.error("[2FA] status:", e?.message || e);
    return res.status(500).json({ error: "Erro ao consultar a verificação em duas etapas." });
  }
}

// POST /api/auth/2fa/configurar
export async function configurar(req: Request, res: Response) {
  try {
    if (!(await podeConfigurar(req, res))) return;
    const u = req.user as any;
    const { segredo, otpauth } = await iniciarConfiguracao(u.id, u.email, EMISSOR);
    const qr = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 });
    return res.json({ segredo, otpauth, qr });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao configurar." });
  }
}

// POST /api/auth/2fa/ativar  { codigo }
export async function ativar(req: Request, res: Response) {
  try {
    if (!(await podeConfigurar(req, res))) return;
    const codigos = await ativarDoisFatores(req.user!.id, req.body?.codigo);
    if (!codigos) return res.status(400).json({ error: "Código inválido. Confira o horário do celular e tente de novo." });
    console.log(`[2FA] ativado user=${req.user!.id}`);
    return res.json({ ativo: true, codigos_recuperacao: codigos });
  } catch (e: any) {
    console.error("[2FA] ativar:", e?.message || e);
    return res.status(500).json({ error: "Erro ao ativar." });
  }
}

async function senhaConfere(userId: number, senha: unknown): Promise<boolean> {
  if (typeof senha !== "string" || !senha) return false;
  const user = await storage.getUserById(userId);
  return !!user && (await bcrypt.compare(senha, (user as any).senha));
}

// POST /api/auth/2fa/desativar  { senha, codigo }
export async function desativar(req: Request, res: Response) {
  try {
    if (!(await podeConfigurar(req, res))) return;
    const uid = req.user!.id;
    if (!(await senhaConfere(uid, req.body?.senha))) return res.status(400).json({ error: "Senha incorreta." });
    if (!(await conferirSegundoFator(uid, req.body?.codigo))) return res.status(400).json({ error: "Código inválido." });
    await desativarDoisFatores(uid);
    console.log(`[2FA] desativado pelo próprio usuário user=${uid}`);
    return res.json({ ativo: false });
  } catch (e: any) {
    console.error("[2FA] desativar:", e?.message || e);
    return res.status(500).json({ error: "Erro ao desativar." });
  }
}

// POST /api/auth/2fa/codigos  { codigo }  — gera novos códigos de recuperação
export async function regerarCodigos(req: Request, res: Response) {
  try {
    if (!(await podeConfigurar(req, res))) return;
    const uid = req.user!.id;
    if (!(await conferirSegundoFator(uid, req.body?.codigo))) return res.status(400).json({ error: "Código inválido." });
    return res.json({ codigos_recuperacao: await novosCodigosRecuperacao(uid) });
  } catch (e: any) {
    console.error("[2FA] códigos:", e?.message || e);
    return res.status(500).json({ error: "Erro ao gerar códigos." });
  }
}
