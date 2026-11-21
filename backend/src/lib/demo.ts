/**
 * Everything the public read-only "demo" admin may see is decided here, in one place.
 *
 * `demoAdminView` is mounted once on the admin router, right after `requireAdmin`.
 * For the demo role it is deny-by-default: a GET path answers only if it is listed
 * in DEMO_VIEWS, and its JSON goes through that view before it is sent. A new admin
 * endpoint is therefore closed to the demo role until someone decides here what it
 * may show. Personal fields are replaced by fixed placeholders (nothing is derived
 * from the real value), and only the query parameters listed for a view reach the
 * handler, so search, filter and sort parameters cannot be used to probe real values.
 */
import type { NextFunction, Request, Response } from "express"
import { HttpError } from "./http.js"
import { locals } from "../middleware/auth.js"

export const HIDDEN = "Hidden in the public demo"
const HIDDEN_PHONE = "00000 000000"
const hiddenEmail = (n: number) => `hidden-${n}@demo.invalid`

type Row = Record<string, unknown>
type View = { query?: string[]; view: (body: unknown) => unknown }

const asIs = (body: unknown) => body
const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]))
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])
/** `{ items, total, page }` lists: every row goes through `row`, nothing else is copied. */
const paged = (row: (r: Row, n: number) => Row) => (body: unknown) => {
  const b = (body || {}) as Row
  return { items: rows(b.items).map((r, i) => row(r, i + 1)), total: b.total, page: b.page }
}
const LINE = ["slug", "name", "unitCents", "qty", "lineCents"]

export const DEMO_VIEWS: Record<string, View> = {
  "/sections": { view: asIs }, // public menu
  "/dishes": { view: asIs }, // public menu
  "/reservations": {
    query: ["page", "limit", "date", "status"],
    view: paged((r, n) => ({
      ...pick(r, ["_id", "code", "date", "time", "partySize", "status", "createdAt", "updatedAt"]),
      name: `Guest ${n}`,
      email: hiddenEmail(n),
      phone: r.phone ? HIDDEN_PHONE : "",
      notes: r.notes ? HIDDEN : "",
    })),
  },
  "/orders": {
    query: ["page", "limit", "status"],
    view: paged((o, n) => ({
      ...pick(o, ["_id", "code", "type", "pickupAt", "totalCents", "status", "createdAt", "updatedAt"]),
      items: rows(o.items).map((l) => pick(l, LINE)),
      name: `Guest ${n}`,
      phone: HIDDEN_PHONE,
      email: o.email ? hiddenEmail(n) : "",
      notes: o.notes ? HIDDEN : "",
    })),
  },
  "/messages": {
    query: ["page", "limit"],
    view: paged((m, n) => ({
      ...pick(m, ["_id", "read", "createdAt", "updatedAt"]),
      name: `Visitor ${n}`,
      email: hiddenEmail(n),
      subject: m.subject ? HIDDEN : "",
      message: HIDDEN,
    })),
  },
  "/subscribers": {
    view: (body) => rows(body).map((s, i) => ({ ...pick(s, ["_id", "createdAt", "updatedAt"]), email: hiddenEmail(i + 1) })),
  },
}

export function demoAdminView(req: Request, res: Response, next: NextFunction) {
  if (locals(req).admin?.role !== "demo") return next()
  const entry = DEMO_VIEWS[req.path.replace(/\/+$/, "") || "/"]
  if (!entry) return next(new HttpError(403, "This page is not part of the public demo."))
  const allowed = entry.query || []
  req.query = Object.fromEntries(Object.entries(req.query).filter(([k, v]) => allowed.includes(k) && typeof v === "string"))
  const send = res.json.bind(res)
  res.json = (body?: unknown) => (res.statusCode < 400 ? send(entry.view(JSON.parse(JSON.stringify(body ?? null)))) : send(body))
  next()
}
