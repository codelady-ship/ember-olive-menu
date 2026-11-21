import fs from "node:fs"
import path from "node:path"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { DEMO_VIEWS } from "../src/lib/demo.js"
import { Dish } from "../src/models/Dish.js"
import { Admin } from "../src/models/misc.js"
import { DEMO_ADMIN, seedDemoAdmin } from "../src/seed/seed.js"
import { ADMIN, login, makeApp, resetDb, startDb, stopDb, testConfig } from "./helpers.js"

const cfg = testConfig()
const app = makeApp(cfg)
let token = ""
const auth = () => ({ Authorization: "Bearer " + token })

// A real 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8AAAgMBAQEAsP1nAAAAAElFTkSuQmCC", "base64")

beforeAll(startDb)
afterAll(stopDb)
beforeEach(async () => {
  await resetDb()
  token = await login(app)
})

describe("sign-in", () => {
  it("issues a token for the right password only", async () => {
    expect(token.split(".")).toHaveLength(3)
    await request(app).post("/api/auth/login").send({ ...ADMIN, password: "wrong-password" }).expect(401)
    await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "x" }).expect(401)
    const me = await request(app).get("/api/auth/me").set(auth()).expect(200)
    expect(me.body.email).toBe(ADMIN.email)
  })

  it("guards every admin route", async () => {
    for (const p of ["/api/admin/dishes", "/api/admin/reservations", "/api/admin/orders", "/api/admin/messages", "/api/admin/subscribers"]) {
      await request(app).get(p).expect(401)
      await request(app).get(p).set("Authorization", "Bearer not.a.token").expect(401)
    }
    const other = makeApp(testConfig({ JWT_SECRET: "a-different-secret-that-is-also-over-32-chars" }))
    await request(other).get("/api/admin/dishes").set(auth()).expect(401)
  })
})

describe("dish CRUD", () => {
  it("creates, edits and deletes a dish", async () => {
    const created = await request(app)
      .post("/api/admin/dishes")
      .set(auth())
      .send({ slug: "saffron-risotto", name: "Saffron Risotto", section: "pasta", priceCents: 1800, allergens: ["milk"], badges: ["vegetarian"], featured: true, featuredOrder: 5, effect: "steam" })
      .expect(201)
    const id = created.body._id
    const edited = await request(app).patch("/api/admin/dishes/" + id).set(auth()).send({ priceCents: 1900, available: false }).expect(200)
    expect(edited.body).toMatchObject({ priceCents: 1900, available: false, featured: true, effect: "steam" })
    const menu = await request(app).get("/api/menu")
    expect(menu.body.featured.at(-1).slug).toBe("saffron-risotto")
    await request(app).delete("/api/admin/dishes/" + id).set(auth()).expect(204)
    expect(await Dish.exists({ slug: "saffron-risotto" })).toBeNull()
  })

  it("validates dishes", async () => {
    const bad = [
      { slug: "Bad Slug", name: "x", section: "pasta", priceCents: 100 },
      { slug: "ok", name: "x", section: "pasta", priceCents: -1 },
      { slug: "ok", name: "x", section: "pasta", priceCents: 9.99 },
      { slug: "ok", name: "x", section: "pasta", priceCents: 100, allergens: ["glitter"] },
      { slug: "ok", name: "x", section: "pasta", priceCents: 100, image: "javascript:alert(1)" },
      { slug: "ok", name: "x", section: "pasta", priceCents: 100, image: "../../etc/passwd" },
    ]
    for (const b of bad) await request(app).post("/api/admin/dishes").set(auth()).send(b).expect(400)
    await request(app).post("/api/admin/dishes").set(auth()).send({ slug: "ok", name: "x", section: "no-such", priceCents: 100 }).expect(400)
    await request(app).post("/api/admin/dishes").set(auth()).send({ slug: "espresso", name: "x", section: "drinks", priceCents: 100 }).expect(409)
    await request(app).patch("/api/admin/dishes/not-an-id").set(auth()).send({ priceCents: 1 }).expect(400)
  })

  it("will not delete a section that still has dishes", async () => {
    const sections = await request(app).get("/api/admin/sections").set(auth()).expect(200)
    const pasta = sections.body.find((s: { slug: string }) => s.slug === "pasta")
    await request(app).delete("/api/admin/sections/" + pasta._id).set(auth()).expect(409)
  })
})

describe("image upload", () => {
  it("stores a real image under a server-made name", async () => {
    const r = await request(app).post("/api/admin/uploads").set(auth()).attach("image", PNG, { filename: "../../evil name.png", contentType: "image/png" }).expect(201)
    expect(r.body.url).toMatch(/^\/uploads\/[a-f0-9-]{36}\.png$/)
    expect(fs.existsSync(path.join(cfg.UPLOAD_DIR, path.basename(r.body.url)))).toBe(true)
    const served = await request(app).get(r.body.url).expect(200)
    expect(served.headers["content-type"]).toBe("image/png")
    // and a dish can point at it
    await request(app).post("/api/admin/dishes").set(auth()).send({ slug: "new-dish", name: "New", section: "pasta", priceCents: 100, image: r.body.url }).expect(201)
  })

  it("refuses non-images, disguised files and oversized files", async () => {
    await request(app).post("/api/admin/uploads").set(auth()).attach("image", Buffer.from("<svg onload=alert(1)>"), { filename: "x.svg", contentType: "image/svg+xml" }).expect(415)
    await request(app).post("/api/admin/uploads").set(auth()).attach("image", Buffer.from("#!/bin/sh\necho hi"), { filename: "x.png", contentType: "image/png" }).expect(415)
    const big = Buffer.concat([PNG, Buffer.alloc(1.2 * 1024 * 1024)])
    await request(app).post("/api/admin/uploads").set(auth()).attach("image", big, { filename: "big.png", contentType: "image/png" }).expect(413)
    await request(app).post("/api/admin/uploads").attach("image", PNG, { filename: "a.png", contentType: "image/png" }).expect(401)
  })
})

describe("orders and messages for the kitchen", () => {
  it("lists and moves orders along", async () => {
    await request(app).post("/api/orders").send({ name: "Ada", phone: "07700 900000", pickupAt: "13:00", items: [{ slug: "espresso", qty: 2 }] }).expect(201)
    const list = await request(app).get("/api/admin/orders").set(auth()).expect(200)
    expect(list.body.total).toBe(1)
    const o = await request(app).patch("/api/admin/orders/" + list.body.items[0]._id).set(auth()).send({ status: "ready" }).expect(200)
    expect(o.body.status).toBe("ready")
    await request(app).patch("/api/admin/orders/" + list.body.items[0]._id).set(auth()).send({ status: "eaten" }).expect(400)
  })

  it("reads and deletes messages", async () => {
    await request(app).post("/api/contact").send({ name: "Grace", email: "grace@example.com", message: "Is the terrace open in March?" }).expect(201)
    const list = await request(app).get("/api/admin/messages").set(auth()).expect(200)
    const id = list.body.items[0]._id
    await request(app).patch("/api/admin/messages/" + id).set(auth()).send({ read: true }).expect(200)
    await request(app).delete("/api/admin/messages/" + id).set(auth()).expect(204)
  })
})

describe("public demo admin", () => {
  it("is created by the seed, reads every admin page and cannot write", async () => {
    expect(await seedDemoAdmin({})).toBe(DEMO_ADMIN.email)
    const r = await request(app).post("/api/auth/login").send(DEMO_ADMIN).expect(200)
    expect(r.body.role).toBe("demo")
    const demo = { Authorization: "Bearer " + r.body.token }
    expect((await request(app).get("/api/auth/me").set(demo).expect(200)).body.role).toBe("demo")
    for (const p of ["/api/admin/sections", "/api/admin/dishes", "/api/admin/reservations", "/api/admin/orders", "/api/admin/messages", "/api/admin/subscribers"]) {
      await request(app).get(p).set(demo).expect(200)
    }
    const dish = (await request(app).get("/api/admin/dishes").set(demo)).body[0]
    const writes = [
      request(app).post("/api/admin/dishes").set(demo).send({ slug: "demo-dish", name: "Demo", section: "pasta", priceCents: 100 }),
      request(app).patch("/api/admin/dishes/" + dish._id).set(demo).send({ priceCents: 1 }),
      request(app).delete("/api/admin/dishes/" + dish._id).set(demo),
      request(app).post("/api/admin/uploads").set(demo).attach("image", PNG, { filename: "a.png", contentType: "image/png" }),
    ]
    for (const w of writes) {
      const res = await w.expect(403)
      expect(res.body.error).toMatch(/read-only/)
    }
    expect((await Dish.findById(dish._id).lean())?.priceCents).toBe(dish.priceCents)
    // a real admin keeps full rights, and the seed never turns a real admin into a demo one
    await request(app).patch("/api/admin/dishes/" + dish._id).set(auth()).send({ priceCents: dish.priceCents + 1 }).expect(200)
    await Admin.updateOne({ email: DEMO_ADMIN.email }, { $set: { role: "admin" } })
    expect(await seedDemoAdmin({})).toBeNull()
    expect(await seedDemoAdmin({ DEMO_ADMIN: "false" })).toBeNull()
  })
})

describe("public demo admin never sees personal data", () => {
  const SECRET = {
    name: "Zarifa Qurbanova",
    email: "zarifa.private@realmail.test",
    phone: "+44 20 7946 0958",
    notes: "Gate code 4471, anniversary surprise",
    subject: "Invoice for Qurbanova Ltd",
    message: "Please call my husband Orkhan back today about the allergy.",
  }
  // every personal value written below, whole and in parts
  const FORBIDDEN = [SECRET.name, "Zarifa", "Qurbanova", SECRET.email, "realmail", SECRET.phone, "7946 0958", SECRET.notes, "4471", "anniversary", SECRET.subject, "Invoice", SECRET.message, "Orkhan"]

  async function visitorWrites() {
    await request(app).post("/api/reservations").send({ name: SECRET.name, email: SECRET.email, phone: SECRET.phone, date: "2027-03-05", time: "19:00", partySize: 2, notes: SECRET.notes }).expect(201)
    await request(app).post("/api/orders").send({ name: SECRET.name, phone: SECRET.phone, email: SECRET.email, pickupAt: "13:00", notes: SECRET.notes, items: [{ slug: "espresso", qty: 2 }] }).expect(201)
    await request(app).post("/api/contact").send({ name: SECRET.name, email: SECRET.email, subject: SECRET.subject, message: SECRET.message }).expect(201)
    await request(app).post("/api/newsletter").send({ email: SECRET.email }).expect(201)
  }
  async function demoAuth() {
    await seedDemoAdmin({})
    const r = await request(app).post("/api/auth/login").send(DEMO_ADMIN).expect(200)
    return { Authorization: "Bearer " + r.body.token }
  }

  it("answers every admin GET with placeholders, whatever the query says", async () => {
    await visitorWrites()
    const demo = await demoAuth()
    const paths = Object.keys(DEMO_VIEWS)
    expect([...paths].sort()).toEqual(["/dishes", "/messages", "/orders", "/reservations", "/sections", "/subscribers"])
    const probes = [
      ...paths,
      "/reservations?date=2027-03-05&status=confirmed",
      "/reservations?q=Zarifa&search=Zarifa&name=Zarifa&sort=name&email=" + encodeURIComponent(SECRET.email),
      "/orders?status=new&phone=" + encodeURIComponent(SECRET.phone) + "&sort=-name",
      "/messages?limit=100&q=Orkhan&email[$regex]=^z",
      "/subscribers?sort=email&q=zarifa",
    ]
    for (const p of probes) {
      const res = await request(app).get("/api/admin" + p).set(demo)
      expect(res.status, p).toBe(200)
      const text = JSON.stringify(res.body).toLowerCase()
      for (const value of FORBIDDEN) expect(text.includes(value.toLowerCase()), p + ' leaks "' + value + '"').toBe(false)
    }

    // rows are still listed, with fixed placeholders
    const res = (await request(app).get("/api/admin/reservations").set(demo)).body
    expect(res.total).toBe(1)
    expect(res.items[0]).toMatchObject({ name: "Guest 1", email: "hidden-1@demo.invalid", phone: "00000 000000", notes: "Hidden in the public demo", date: "2027-03-05", time: "19:00", partySize: 2, status: "confirmed" })
    const orders = (await request(app).get("/api/admin/orders").set(demo)).body
    expect(orders.items[0]).toMatchObject({ name: "Guest 1", phone: "00000 000000", email: "hidden-1@demo.invalid", notes: "Hidden in the public demo", pickupAt: "13:00", status: "new" })
    expect(orders.items[0].items[0]).toMatchObject({ slug: "espresso", qty: 2 })
    const msgs = (await request(app).get("/api/admin/messages").set(demo)).body
    expect(msgs.items[0]).toMatchObject({ name: "Visitor 1", email: "hidden-1@demo.invalid", subject: "Hidden in the public demo", message: "Hidden in the public demo", read: false })
    expect((await request(app).get("/api/admin/subscribers").set(demo)).body.map((s: { email: string }) => s.email)).toEqual(["hidden-1@demo.invalid"])

    // unknown query parameters change nothing for the demo role (no oracle)
    const probe = await request(app).get("/api/admin/reservations?name=Nobody&q=nobody").set(demo).expect(200)
    expect(probe.body).toEqual(res)

    // an admin GET that is not listed in lib/demo.ts is refused for the demo role (deny by default)
    await request(app).get("/api/admin/guests").set(demo).expect(403)
    await request(app).get("/api/admin/guests").set(auth()).expect(404)
  })

  it("still shows a real admin the full data", async () => {
    await visitorWrites()
    await demoAuth()
    const res = (await request(app).get("/api/admin/reservations").set(auth()).expect(200)).body.items[0]
    expect(res).toMatchObject({ name: SECRET.name, email: SECRET.email, phone: SECRET.phone, notes: SECRET.notes })
    const order = (await request(app).get("/api/admin/orders").set(auth()).expect(200)).body.items[0]
    expect(order).toMatchObject({ name: SECRET.name, phone: SECRET.phone, email: SECRET.email, notes: SECRET.notes })
    const msg = (await request(app).get("/api/admin/messages").set(auth()).expect(200)).body.items[0]
    expect(msg).toMatchObject({ name: SECRET.name, email: SECRET.email, subject: SECRET.subject, message: SECRET.message })
    expect((await request(app).get("/api/admin/subscribers").set(auth()).expect(200)).body[0].email).toBe(SECRET.email)
    await request(app).patch("/api/admin/messages/" + msg._id).set(auth()).send({ read: true }).expect(200)
  })
})

describe("DEMO_ADMIN=false kill switch", () => {
  it("refuses the demo login and tokens issued earlier, and removes the account", async () => {
    await seedDemoAdmin({})
    const token = (await request(app).post("/api/auth/login").send(DEMO_ADMIN).expect(200)).body.token
    const demo = { Authorization: "Bearer " + token }
    await request(app).get("/api/admin/orders").set(demo).expect(200)

    // Same database, server started with DEMO_ADMIN=false. Even before the account is removed:
    const off = makeApp(testConfig({ DEMO_ADMIN: "false" }))
    expect((await request(off).post("/api/auth/login").send(DEMO_ADMIN).expect(401)).body.error).toBe("Email or password is incorrect.")
    for (const p of ["/api/auth/me", "/api/admin/sections", "/api/admin/dishes", "/api/admin/reservations", "/api/admin/orders", "/api/admin/messages", "/api/admin/subscribers"]) {
      await request(off).get(p).set(demo).expect(401)
    }
    await request(off).post("/api/admin/dishes").set(demo).send({}).expect(401)
    // the real admin is not affected
    await request(off).get("/api/admin/orders").set(auth()).expect(200)
    await request(off).post("/api/auth/login").send(ADMIN).expect(200)

    // what server.ts and `npm run seed` do on start with the switch off
    expect(await seedDemoAdmin({ DEMO_ADMIN: "false" })).toBeNull()
    expect(await Admin.countDocuments({ role: "demo" })).toBe(0)
    expect(await Admin.countDocuments({ email: DEMO_ADMIN.email })).toBe(0)
    expect(await Admin.countDocuments({ email: ADMIN.email })).toBe(1)
    // gone for good: also on an app where the demo is on, until it is seeded again
    await request(app).post("/api/auth/login").send(DEMO_ADMIN).expect(401)
    await request(app).get("/api/admin/orders").set(demo).expect(401)
    await request(off).post("/api/auth/login").send(DEMO_ADMIN).expect(401)
  })

  it("is on unless DEMO_ADMIN is exactly false, and never deletes a real admin", async () => {
    expect(testConfig().DEMO_ADMIN).toBe(true)
    expect(testConfig({ DEMO_ADMIN: "true" }).DEMO_ADMIN).toBe(true)
    expect(testConfig({ DEMO_ADMIN: "false" }).DEMO_ADMIN).toBe(false)
    await Admin.create({ email: DEMO_ADMIN.email, passwordHash: "x", role: "admin" })
    expect(await seedDemoAdmin({ DEMO_ADMIN: "false" })).toBeNull()
    expect(await Admin.countDocuments({ email: DEMO_ADMIN.email, role: "admin" })).toBe(1)
  })
})
