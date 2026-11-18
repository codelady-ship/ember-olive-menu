/**
 * In-browser stand-in for the admin API, used by the "Demo admin" button when the
 * API is not configured or does not answer. It starts from the same starter menu
 * as the server seed (shared/menu.json) plus a few sample bookings, orders and
 * messages. Changes live in sessionStorage only: closing the tab (or "Reset demo
 * data") throws them away, and nothing is ever sent anywhere.
 */
import starter from "../../../shared/menu.json"
import { ApiError } from "../lib/api"

export const SANDBOX_TOKEN = "sandbox-demo"
const KEY = "eo-admin-sandbox-v1"

type Row = { _id: string; [k: string]: unknown }
type Db = { sections: Row[]; dishes: Row[]; reservations: Row[]; orders: Row[]; messages: Row[]; subscribers: { email: string; createdAt: string }[] }

let n = 0
const oid = () => (Date.now().toString(16) + (n++).toString(16).padStart(4, "0") + Math.random().toString(16).slice(2)).slice(0, 24).padEnd(24, "0")
const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

function fresh(): Db {
  const dish = (slug: string) => starter.dishes.find((d) => d.slug === slug) || starter.dishes[0]
  const line = (slug: string, qty: number) => ({ slug, name: dish(slug).name, qty, priceCents: dish(slug).priceCents })
  const order = (code: string, name: string, pickupAt: string, items: ReturnType<typeof line>[], status: string, notes = "", hours = 1) => ({
    _id: oid(),
    code,
    name,
    phone: "07700 900" + code.replace(/\D/g, "").slice(-3).padStart(3, "0"),
    pickupAt,
    items,
    totalCents: items.reduce((s, i) => s + i.priceCents * i.qty, 0),
    status,
    notes,
    createdAt: ago(hours),
  })
  const res = (code: string, name: string, date: string, time: string, partySize: number, status: string, notes = "") => ({
    _id: oid(),
    code,
    name,
    email: name.split(" ")[0].toLowerCase() + "@example.com",
    phone: "07700 900" + code.replace(/\D/g, "").slice(-3).padStart(3, "0"),
    date,
    time,
    partySize,
    notes,
    status,
  })
  const [a, b, c] = starter.dishes.map((d) => d.slug)
  return {
    sections: starter.sections.map((s) => ({ _id: oid(), ...s })),
    dishes: starter.dishes.map((d) => ({ _id: oid(), ...d })),
    reservations: [
      res("R-4K2P11", "Ada Lovelace", day(0), "19:00", 2, "confirmed", "Window table if possible"),
      res("R-7Q9D24", "Alan Turing", day(0), "20:30", 4, "seated"),
      res("R-2M5H37", "Grace Hopper", day(1), "18:30", 6, "confirmed", "Birthday, one nut allergy"),
      res("R-9T1C48", "Katherine Johnson", day(2), "13:00", 3, "cancelled"),
    ],
    orders: [
      order("O-31A", "Mary Jackson", "12:30", [line(a, 2), line(b, 1)], "new", "Extra napkins", 0.2),
      order("O-32B", "Dorothy Vaughan", "13:15", [line(c, 1)], "preparing", "", 0.6),
      order("O-33C", "Hedy Lamarr", "18:00", [line(a, 1), line(c, 2)], "ready", "", 3),
    ],
    messages: [
      { _id: oid(), name: "Grace", email: "grace@example.com", subject: "Terrace in March?", message: "Is the terrace open in March? We are a group of eight.", read: false, createdAt: ago(5) },
      { _id: oid(), name: "Linus", email: "linus@example.com", subject: "Gluten-free options", message: "Do you have gluten-free pasta?", read: true, createdAt: ago(30) },
    ],
    subscribers: [
      { email: "ada@example.com", createdAt: ago(48) },
      { email: "alan@example.com", createdAt: ago(72) },
    ],
  }
}

let db: Db | null = null
function load(): Db {
  if (db) return db
  try {
    db = JSON.parse(sessionStorage.getItem(KEY) || "null")
  } catch {
    db = null
  }
  return (db ||= fresh())
}
function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* storage blocked: the sandbox lives in memory for this page */
  }
}
export function resetSandbox() {
  db = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

const notFound = (what: string) => new ApiError(404, "No such " + what + ".")
const pageOf = (items: Row[]) => ({ items, total: items.length, page: 1 })
const slugOk = (s: unknown) => typeof s === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)

/** Same paths and answers as the admin API, but answered in this tab. */
export async function sandboxRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const d = load()
  const method = (init.method || "GET").toUpperCase()
  const url = new URL(path, "http://sandbox")
  const q = url.searchParams
  const body = typeof init.body === "string" ? JSON.parse(init.body) : {}
  const [, , scope, kind, id] = url.pathname.split("/") // "", "api", "admin"|"auth", kind, id
  const out = (v: unknown) => Promise.resolve(v as T)
  const write = (v: unknown) => {
    save()
    return out(v)
  }

  if (scope === "auth" && kind === "me") return out({ email: "demo (this browser)", role: "sandbox" })
  if (scope !== "admin") throw new ApiError(404, "Not found.")

  if (method === "GET") {
    if (kind === "sections") return out(d.sections)
    if (kind === "dishes") return out(d.dishes)
    if (kind === "reservations") return out(pageOf(d.reservations.filter((r) => (!q.get("date") || r.date === q.get("date")) && (!q.get("status") || r.status === q.get("status")))))
    if (kind === "orders") return out(pageOf(d.orders.filter((o) => !q.get("status") || o.status === q.get("status"))))
    if (kind === "messages") return out(pageOf(d.messages))
    if (kind === "subscribers") return out(d.subscribers)
  }
  if (kind === "uploads") throw new ApiError(400, "Uploads are off in demo mode. Type an image path such as menu/espresso.webp instead.")
  if (kind === "dishes") {
    if (method === "POST" || method === "PATCH") {
      const cur = method === "PATCH" ? d.dishes.find((x) => x._id === id) : undefined
      if (method === "PATCH" && !cur) throw notFound("dish")
      const next = { ...(cur || {}), ...body }
      const details = [
        !slugOk(next.slug) && { field: "slug", message: "Use lowercase letters, digits and dashes." },
        !String(next.name || "").trim() && { field: "name", message: "Enter a name." },
        !d.sections.some((s) => s.slug === next.section) && { field: "section", message: "No such section." },
        !(Number.isInteger(next.priceCents) && next.priceCents >= 0) && { field: "priceCents", message: "Enter a price." },
      ].filter(Boolean) as { field: string; message: string }[]
      if (details.length) throw new ApiError(400, "Please check the highlighted fields.", details)
      if (d.dishes.some((x) => x.slug === next.slug && x._id !== cur?._id)) throw new ApiError(409, "A dish with this slug already exists.")
      if (cur) {
        Object.assign(cur, next)
        return write(cur)
      }
      const row = { ...next, _id: oid() }
      d.dishes.push(row)
      return write(row)
    }
    if (method === "DELETE") {
      const i = d.dishes.findIndex((x) => x._id === id)
      if (i < 0) throw notFound("dish")
      d.dishes.splice(i, 1)
      return write(undefined)
    }
  }
  if ((kind === "reservations" || kind === "orders") && method === "PATCH") {
    const row = d[kind].find((x) => x._id === id)
    if (!row) throw notFound(kind === "orders" ? "order" : "reservation")
    row.status = body.status
    return write(row)
  }
  if (kind === "messages") {
    const i = d.messages.findIndex((x) => x._id === id)
    if (i < 0) throw notFound("message")
    if (method === "PATCH") {
      d.messages[i].read = !!body.read
      return write(d.messages[i])
    }
    if (method === "DELETE") {
      d.messages.splice(i, 1)
      return write(undefined)
    }
  }
  throw new ApiError(404, "Not found.")
}
