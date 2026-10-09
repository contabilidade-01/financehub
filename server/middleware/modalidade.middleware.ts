import { Request, Response, NextFunction } from "express";
import { temErpPj } from "../../shared/modalidade";

/**
 * Módulos do ERP PJ (contas a receber, centros de custo, DRE gerencial, etc.)
 * são exclusivos da modalidade PJ ME. PJ MEI segue com o módulo PJ simples.
 * Usar depois de combinedAuth + checkImpersonation.
 */
export function requireErpPj(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Não autenticado" });
  if (!temErpPj(req.user as any)) {
    return res.status(403).json({
      error: "Recurso exclusivo da modalidade PJ ME",
      code: "ERP_PJ_ME_REQUIRED",
    });
  }
  next();
}
