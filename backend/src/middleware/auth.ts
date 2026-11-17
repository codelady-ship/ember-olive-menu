import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import type { Config } from "../config.js"
import { HttpError } from "../lib/http.js"
import { Admin } from "../models/misc.js"

export type AdminClaims = { sub: string; role: "admin" }

export function signAdmin(cfg: Config, id: string): string {
  return jwt.sign({ role: "admin" }, cfg.JWT_SECRET, { subject: id, algorithm: "HS256", expiresIn: cfg.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] })
}

/** Bearer token required; the admin must still exist. */
export function requireAdmin(cfg: Config) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const h = req.get("authorization") || ""
      const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(h)
      if (!m) throw new HttpError(401, "Please sign in.")
      let claims: AdminClaims
      try {
        claims = jwt.verify(m[1], cfg.JWT_SECRET, { algorithms: ["HS256"] }) as AdminClaims
      } catch {
        throw new HttpError(401, "Your session has expired. Please sign in again.")
      }
      if (claims.role !== "admin" || !claims.sub) throw new HttpError(401, "Please sign in.")
      const admin = await Admin.findById(claims.sub).select("_id email").lean()
      if (!admin) throw new HttpError(401, "Please sign in.")
      locals(req).admin = { id: String(admin._id), email: admin.email }
      next()
    } catch (e) {
      next(e)
    }
  }
}

type Locals = { admin?: { id: string; email: string } }
export const locals = (req: Request): Locals => ((req as Request & { _eo?: Locals })._eo ??= {})
