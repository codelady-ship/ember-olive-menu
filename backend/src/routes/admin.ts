import { Router } from "express"
import { z } from "zod"
import type { Config } from "../config.js"
import { releaseSeats, takeSeats } from "../lib/booking.js"
import { HttpError, ah, parse } from "../lib/http.js"
import { dishInput, idParam, sectionInput } from "../lib/schemas.js"
import { imageUpload, saveImage } from "../lib/upload.js"
import { requireAdmin } from "../middleware/auth.js"
import { Dish } from "../models/Dish.js"
import { Order } from "../models/Order.js"
import { Reservation } from "../models/Reservation.js"
import { Section } from "../models/Section.js"
import { Message, Subscriber } from "../models/misc.js"

const page = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export function adminRoutes(cfg: Config) {
  const r = Router()
  r.use(requireAdmin(cfg))

  // ---- sections
  r.get(
    "/sections",
    ah(async (_req, res) => {
      res.json(await Section.find().sort({ order: 1, title: 1 }).lean())
    }),
  )
  r.post(
    "/sections",
    ah(async (req, res) => {
      res.status(201).json(await Section.create(parse(sectionInput, req.body)))
    }),
  )
  r.patch(
    "/sections/:id",
    ah(async (req, res) => {
      const { id } = parse(idParam, req.params)
      const body = parse(sectionInput.partial(), req.body)
      const before = await Section.findById(id)
      if (!before) throw new HttpError(404, "No such section.")
      const oldSlug = before.slug
      before.set(body)
      await before.save()
      // keep dishes attached when a section is renamed
      if (body.slug && body.slug !== oldSlug) await Dish.updateMany({ section: oldSlug }, { $set: { section: body.slug } })
      res.json(before)
    }),
  )
  r.delete(
    "/sections/:id",
    ah(async (req, res) => {
      const { id } = parse(idParam, req.params)
      const s = await Section.findById(id)
      if (!s) throw new HttpError(404, "No such section.")
      if (await Dish.exists({ section: s.slug })) throw new HttpError(409, "Move or delete this section's dishes first.")
      await s.deleteOne()
      res.status(204).end()
    }),
  )

  // ---- dishes
  r.get(
    "/dishes",
    ah(async (_req, res) => {
      res.json(await Dish.find().sort({ section: 1, order: 1, name: 1 }).lean())
    }),
  )
  r.post(
    "/dishes",
    ah(async (req, res) => {
      const body = parse(dishInput, req.body)
      if (!(await Section.exists({ slug: body.section }))) throw new HttpError(400, "No such section.", [{ field: "section", message: "No such section." }])
      res.status(201).json(await Dish.create(body))
    }),
  )
  r.patch(
    "/dishes/:id",
    ah(async (req, res) => {
      const { id } = parse(idParam, req.params)
      const body = parse(dishInput.partial(), req.body)
      // .partial() keeps the defaults; only apply what was actually sent
      const sent = Object.fromEntries(Object.entries(body).filter(([k]) => k in (req.body || {})))
      if (sent.section && !(await Section.exists({ slug: sent.section }))) throw new HttpError(400, "No such section.", [{ field: "section", message: "No such section." }])
      const d = await Dish.findByIdAndUpdate(id, { $set: sent }, { new: true, runValidators: true })
      if (!d) throw new HttpError(404, "No such dish.")
      res.json(d)
    }),
  )
  r.delete(
    "/dishes/:id",
    ah(async (req, res) => {
      const { id } = parse(idParam, req.params)
      const d = await Dish.findByIdAndDelete(id)
      if (!d) throw new HttpError(404, "No such dish.")
      res.status(204).end()
    }),
  )

  // ---- image upload: JPEG / PNG / WebP, size-limited, saved under a server-made name
  r.post(
    "/uploads",
    imageUpload(cfg.MAX_UPLOAD_MB),
    ah(async (req, res) => {
      if (!req.file) throw new HttpError(400, "Upload one image in the field \"image\".")
      res.status(201).json({ url: await saveImage(cfg.UPLOAD_DIR, req.file) })
    }),
  )

  // ---- reservations
  r.get(
    "/reservations",
    ah(async (req, res) => {
      const q = parse(page.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), status: z.enum(["confirmed", "cancelled", "seated", "no-show"]).optional() }), req.query)
      const filter: { [k: string]: string } = {}
      if (q.date) filter.date = q.date
      if (q.status) filter.status = q.status
      const [items, total] = await Promise.all([
        Reservation.find(filter).sort({ date: 1, time: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
        Reservation.countDocuments(filter),
      ])
      res.json({ items, total, page: q.page })
    }),
  )
  r.patch(
    "/reservations/:id",
    ah(async (req, res) => {
      const { id } = parse(idParam, req.params)
      const { status } = parse(z.object({ status: z.enum(["confirmed", "cancelled", "seated", "no-show"]) }), req.body)
      const cur = await Reservation.findById(id)
      if (!cur) throw new HttpError(404, "No such reservation.")
      const wasHolding = cur.status !== "cancelled"
      const holds = status !== "cancelled"
      // Flip the status only if nobody changed it meanwhile, then move the seats.
      const upd = await Reservation.findOneAndUpdate({ _id: id, status: cur.status }, { $set: { status } }, { new: true })
      if (!upd) throw new HttpError(409, "This booking was changed meanwhile. Reload and try again.")
      if (wasHolding && !holds) await releaseSeats(cur.date, cur.time, cur.partySize)
      if (!wasHolding && holds) {
        const ok = await takeSeats(cur.date, cur.time, cur.partySize, cfg.RES_SLOT_CAPACITY)
        if (!ok) {
          await Reservation.updateOne({ _id: id }, { $set: { status: "cancelled" } })
          throw new HttpError(409, "That seating is full now, so the booking stays cancelled.")
        }
      }
      res.json(upd)
    }),
  )

  // ---- orders
  r.get(
    "/orders",
    ah(async (req, res) => {
      const q = parse(page.extend({ status: z.enum(["new", "preparing", "ready", "collected", "cancelled"]).optional() }), req.query)
      const filter = q.status ? { status: q.status } : {}
      const [items, total] = await Promise.all([Order.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), Order.countDocuments(filter)])
      res.json({ items, total, page: q.page })
    }),
  )
  r.patch(
    "/orders/:id",
    ah(async (req, res) => {
      const { id } = parse(idParam, req.params)
      const { status } = parse(z.object({ status: z.enum(["new", "preparing", "ready", "collected", "cancelled"]) }), req.body)
      const o = await Order.findByIdAndUpdate(id, { $set: { status } }, { new: true })
      if (!o) throw new HttpError(404, "No such order.")
      res.json(o)
    }),
  )

  // ---- messages and the list
  r.get(
    "/messages",
    ah(async (req, res) => {
      const q = parse(page, req.query)
      const [items, total] = await Promise.all([Message.find().sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), Message.countDocuments()])
      res.json({ items, total, page: q.page })
    }),
  )
  r.patch(
    "/messages/:id",
    ah(async (req, res) => {
      const { id } = parse(idParam, req.params)
      const { read } = parse(z.object({ read: z.boolean() }), req.body)
      const m = await Message.findByIdAndUpdate(id, { $set: { read } }, { new: true })
      if (!m) throw new HttpError(404, "No such message.")
      res.json(m)
    }),
  )
  r.delete(
    "/messages/:id",
    ah(async (req, res) => {
      const { id } = parse(idParam, req.params)
      const m = await Message.findByIdAndDelete(id)
      if (!m) throw new HttpError(404, "No such message.")
      res.status(204).end()
    }),
  )
  r.get(
    "/subscribers",
    ah(async (_req, res) => {
      res.json(await Subscriber.find().sort({ createdAt: -1 }).limit(1000).lean())
    }),
  )

  return r
}
