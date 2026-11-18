import crypto from "node:crypto"
import { Router } from "express"
import type { RequestHandler } from "express"
import bcrypt from "bcryptjs"
import { z } from "zod"
import type { Config } from "../config.js"
import { bookedOn, releaseSeats, takeSeats } from "../lib/booking.js"
import { HttpError, ah, code, parse } from "../lib/http.js"
import { contactInput, loginInput, newsletterInput, orderInput, reservationInput } from "../lib/schemas.js"
import { PICKUP_TIMES, SLOT_TIMES, isRealDate, pickupProblem, slotProblem } from "../lib/time.js"
import { requireAdmin, locals, signAdmin } from "../middleware/auth.js"
import { Dish } from "../models/Dish.js"
import { Order } from "../models/Order.js"
import { Reservation } from "../models/Reservation.js"
import { Section } from "../models/Section.js"
import { Admin, Message, Subscriber } from "../models/misc.js"

type Lean = { [k: string]: unknown }

/** The public shape of a dish: no ids, no timestamps. */
export const dishDto = (d: Lean) => ({
  slug: d.slug,
  name: d.name,
  section: d.section,
  description: d.description || "",
  story: d.story || "",
  priceCents: d.priceCents,
  allergens: d.allergens || [],
  badges: d.badges || [],
  available: d.available !== false,
  featured: !!d.featured,
  featuredOrder: d.featuredOrder ?? 0,
  effect: d.effect || "none",
  image: d.image || "",
  depthImage: d.depthImage || "",
  video: d.video || "",
  alt: d.alt || "",
})

// Compared against when the email is unknown, so the response takes as long as
// for a wrong password and does not reveal which admin emails exist.
let dummyHash: Promise<string> | null = null
const dummy = () => (dummyHash ??= bcrypt.hash(crypto.randomUUID(), 12))

export function publicRoutes(cfg: Config, opts: { now: () => Date; limits: { forms: RequestHandler; login: RequestHandler } }) {
  const r = Router()
  const rules = () => ({ tz: cfg.RESTAURANT_TZ, daysAhead: cfg.RES_DAYS_AHEAD, now: opts.now() })

  r.get("/health", (_req, res) => {
    res.json({ ok: true })
  })

  // ---- menu
  r.get(
    "/menu",
    ah(async (_req, res) => {
      const [sections, dishes] = await Promise.all([Section.find().sort({ order: 1, title: 1 }).lean(), Dish.find().sort({ order: 1, name: 1 }).lean()])
      const all = dishes.map((d) => dishDto(d as Lean))
      res.set("Cache-Control", "public, max-age=60")
      res.json({
        sections: sections.map((s) => ({ slug: s.slug, title: s.title, subtitle: s.subtitle || "", order: s.order, dishes: all.filter((d) => d.section === s.slug) })),
        // The book: featured dishes in the order the owner set.
        featured: all.filter((d) => d.featured).sort((a, b) => Number(a.featuredOrder) - Number(b.featuredOrder)),
      })
    }),
  )
  r.get(
    "/dishes",
    ah(async (req, res) => {
      const q = parse(z.object({ section: z.string().regex(/^[a-z0-9-]{1,60}$/).optional() }), req.query)
      const dishes = await Dish.find(q.section ? { section: q.section } : {}).sort({ order: 1, name: 1 }).lean()
      res.json(dishes.map((d) => dishDto(d as Lean)))
    }),
  )
  r.get(
    "/dishes/:slug",
    ah(async (req, res) => {
      const { slug } = parse(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,60}$/) }), req.params)
      const d = await Dish.findOne({ slug }).lean()
      if (!d) throw new HttpError(404, "No such dish.")
      res.json(dishDto(d as Lean))
    }),
  )

  // ---- reservations
  r.get(
    "/reservations/availability",
    ah(async (req, res) => {
      const { date } = parse(z.object({ date: z.string() }), req.query)
      if (!isRealDate(date)) throw new HttpError(400, "That date does not exist.")
      const booked = await bookedOn(date)
      const slots = SLOT_TIMES.map((time) => {
        const problem = slotProblem(date, time, rules())
        const left = Math.max(0, cfg.RES_SLOT_CAPACITY - (booked.get(time) || 0))
        return { time, seatsLeft: problem ? 0 : left, available: !problem && left > 0, reason: problem || (left > 0 ? null : "Fully booked.") }
      })
      res.json({ date, capacity: cfg.RES_SLOT_CAPACITY, maxParty: cfg.RES_MAX_PARTY, slots })
    }),
  )
  r.post(
    "/reservations",
    opts.limits.forms,
    ah(async (req, res) => {
      const b = parse(reservationInput, req.body)
      if (b.partySize > cfg.RES_MAX_PARTY) throw new HttpError(400, "For parties over " + cfg.RES_MAX_PARTY + ", please call us.")
      const problem = slotProblem(b.date, b.time, rules())
      if (problem) throw new HttpError(400, problem, [{ field: /seating/i.test(problem) ? "time" : "date", message: problem }])
      const ok = await takeSeats(b.date, b.time, b.partySize, cfg.RES_SLOT_CAPACITY)
      if (!ok) throw new HttpError(409, "Sorry, that seating no longer has room for " + b.partySize + ". Please pick another time.")
      try {
        const doc = await Reservation.create({ code: code("EO"), name: b.name, email: b.email, phone: b.phone, date: b.date, time: b.time, partySize: b.partySize, notes: b.notes })
        res.status(201).json({ code: doc.code, date: doc.date, time: doc.time, partySize: doc.partySize, status: doc.status })
      } catch (e) {
        await releaseSeats(b.date, b.time, b.partySize)
        throw e
      }
    }),
  )

  // ---- takeaway orders: prices always come from the database
  r.get("/orders/pickup-times", (_req, res) => {
    const now = opts.now()
    res.json({ times: PICKUP_TIMES.filter((t) => !pickupProblem(t, { tz: cfg.RESTAURANT_TZ, now })) })
  })
  r.post(
    "/orders",
    opts.limits.forms,
    ah(async (req, res) => {
      const b = parse(orderInput, req.body)
      const problem = pickupProblem(b.pickupAt, { tz: cfg.RESTAURANT_TZ, now: opts.now() })
      if (problem) throw new HttpError(400, problem, [{ field: "pickupAt", message: problem }])
      // merge repeated lines of the same dish
      const qty = new Map<string, number>()
      for (const it of b.items) qty.set(it.slug, (qty.get(it.slug) || 0) + it.qty)
      if ([...qty.values()].some((q) => q > 20)) throw new HttpError(400, "At most 20 of any one dish per order.")
      const dishes = await Dish.find({ slug: { $in: [...qty.keys()] } }).lean()
      const bySlug = new Map(dishes.map((d) => [d.slug, d]))
      const items = [...qty.entries()].map(([slug, q]) => {
        const d = bySlug.get(slug)
        if (!d) throw new HttpError(400, "One of the dishes is no longer on the menu.", [{ field: "items", message: slug }])
        if (!d.available) throw new HttpError(409, d.name + " is sold out today.", [{ field: "items", message: slug }])
        return { slug, name: d.name, unitCents: d.priceCents, qty: q, lineCents: d.priceCents * q }
      })
      const totalCents = items.reduce((s, i) => s + i.lineCents, 0)
      const doc = await Order.create({ code: code("TO"), name: b.name, phone: b.phone, email: b.email, pickupAt: b.pickupAt, notes: b.notes, items, totalCents })
      res.status(201).json({ code: doc.code, pickupAt: doc.pickupAt, items, totalCents, status: doc.status })
    }),
  )

  // ---- newsletter: the same answer whether or not the address was already on the list
  r.post(
    "/newsletter",
    opts.limits.forms,
    ah(async (req, res) => {
      const b = parse(newsletterInput, req.body)
      await Subscriber.updateOne({ email: b.email }, { $setOnInsert: { email: b.email } }, { upsert: true }).catch((e) => {
        if ((e as { code?: number }).code !== 11000) throw e
      })
      res.status(201).json({ ok: true })
    }),
  )

  // ---- contact
  r.post(
    "/contact",
    opts.limits.forms,
    ah(async (req, res) => {
      const b = parse(contactInput, req.body)
      await Message.create({ name: b.name, email: b.email, subject: b.subject, message: b.message })
      res.status(201).json({ ok: true })
    }),
  )

  // ---- admin sign-in
  r.post(
    "/auth/login",
    opts.limits.login,
    ah(async (req, res) => {
      const b = parse(loginInput, req.body)
      const admin = await Admin.findOne({ email: b.email }).lean()
      const ok = await bcrypt.compare(b.password, admin?.passwordHash || (await dummy()))
      if (!admin || !ok) throw new HttpError(401, "Email or password is incorrect.")
      const role = admin.role === "demo" ? "demo" : "admin"
      res.json({ token: signAdmin(cfg, String(admin._id), role), email: admin.email, role })
    }),
  )
  r.get(
    "/auth/me",
    requireAdmin(cfg),
    ah(async (req, res) => {
      res.json({ email: locals(req).admin?.email, role: locals(req).admin?.role })
    }),
  )

  return r
}
