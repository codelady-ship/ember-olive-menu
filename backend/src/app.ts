import path from "node:path"
import cors from "cors"
import express from "express"
import rateLimit from "express-rate-limit"
import helmet from "helmet"
import type { Config } from "./config.js"
import { corsOrigins } from "./config.js"
import { errorHandler, notFound } from "./middleware/errors.js"
import { adminRoutes } from "./routes/admin.js"
import { publicRoutes } from "./routes/public.js"

export type AppOptions = {
  /** The clock, so tests can pin "now". */
  now?: () => Date
  /** Rate limits are on by default; tests that fire many requests turn them off. */
  rateLimits?: boolean
}

export function createApp(cfg: Config, opts: AppOptions = {}) {
  const app = express()
  const now = opts.now || (() => new Date())
  const limitsOn = opts.rateLimits !== false

  app.disable("x-powered-by")
  // Render and similar hosts sit behind one proxy; trust exactly that hop for the client IP.
  app.set("trust proxy", 1)
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }))

  const allowed = new Set(corsOrigins(cfg))
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  )
  app.use(express.json({ limit: "64kb" }))

  const pass: express.RequestHandler = (_req, _res, next) => next()
  const limit = (max: number, windowMin: number, message: string) =>
    limitsOn ? rateLimit({ windowMs: windowMin * 60_000, limit: max, standardHeaders: "draft-7", legacyHeaders: false, message: { error: message } }) : pass

  app.use("/api", limit(600, 15, "Too many requests. Please slow down."))

  // Uploaded dish photos, readable by the site on another origin (GitHub Pages).
  app.use(
    "/uploads",
    (_req, res, next) => {
      res.set("Cross-Origin-Resource-Policy", "cross-origin")
      res.set("X-Content-Type-Options", "nosniff")
      next()
    },
    express.static(path.resolve(cfg.UPLOAD_DIR), { index: false, dotfiles: "deny", maxAge: "7d", fallthrough: false }),
  )

  app.use(
    "/api",
    publicRoutes(cfg, {
      now,
      limits: {
        forms: limit(20, 15, "Too many submissions. Please try again in a few minutes."),
        login: limit(10, 15, "Too many sign-in attempts. Please wait 15 minutes."),
      },
    }),
  )
  app.use("/api/admin", adminRoutes(cfg))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
