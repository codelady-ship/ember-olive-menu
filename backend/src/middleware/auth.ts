import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import type { Config } from "../config.js"
import { HttpError } from "../lib/http.js"
import { Admin } from "../models/misc.js"

export type AdminRole = "admin" | "demo"
export type AdminClaims = { sub: string; role: AdminRole }

export const DEMO_READ_ONLY = "Demo admin is read-only: changes are not saved."
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export function signAdmin(cfg: Config, id: string, role: AdminRole = "admin"): string {
  return jwt.sign({ role }, cfg.JWT_SECRET, { subject: id, algorithm: "HS256", expiresIn: cfg.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] })
}

/**
 * Bearer token required; the admin must still exist. The demo role may only read, what it reads is
 * filtered by demoAdminView (lib/demo.ts), and with DEMO_ADMIN=false its tokens are refused outright.
 */
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
      if ((claims.role !== "admin" && claims.role !== "demo") || !claims.sub) throw new HttpError(401, "Please sign in.")
      const admin = await Admin.findById(claims.sub).select("_id email role").lean()
      if (!admin) throw new HttpError(401, "Please sign in.")
      // The role comes from the database, so a token can never grant more than the account has.
      const role: AdminRole = admin.role === "demo" ? "demo" : "admin"
      if (role === "demo" && !cfg.DEMO_ADMIN) throw new HttpError(401, "Please sign in.")
      if (role === "demo" && !READ_METHODS.has(req.method)) throw new HttpError(403, DEMO_READ_ONLY)
      locals(req).admin = { id: String(admin._id), email: admin.email, role }
      next()
    } catch (e) {
      next(e)
    }
  }
}

type Locals = { admin?: { id: string; email: string; role: AdminRole } }
export const locals = (req: Request): Locals => ((req as Request & { _eo?: Locals })._eo ??= {})
