import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Dish } from "../src/models/Dish.js"
import { Order } from "../src/models/Order.js"
import { Message, Subscriber } from "../src/models/misc.js"
import { makeApp, resetDb, startDb, stopDb, testConfig } from "./helpers.js"

const app = makeApp()

beforeAll(startDb)
afterAll(stopDb)
beforeEach(resetDb)

describe("menu", () => {
  it("serves sections with dishes, and the featured dishes in book order", async () => {
    const r = await request(app).get("/api/menu").expect(200)
    expect(r.body.sections.map((s: { slug: string }) => s.slug)).toEqual(["starters", "brunch", "pasta", "mains", "desserts", "drinks"])
    expect(r.body.featured.map((d: { slug: string }) => d.slug)).toEqual(["truffle-tagliatelle", "eggs-benedict", "fish-and-chips", "ruby-citrus-fizz"])
    const fizz = r.body.featured[3]
    expect(fizz.effect).toBe("fizz")
    expect(fizz).not.toHaveProperty("_id")
  })

  it("follows a new featured order", async () => {
    await Dish.updateOne({ slug: "ruby-citrus-fizz" }, { featuredOrder: 0 })
    const r = await request(app).get("/api/menu").expect(200)
    expect(r.body.featured[0].slug).toBe("ruby-citrus-fizz")
  })

  it("returns one dish and 404s an unknown one", async () => {
    const r = await request(app).get("/api/dishes/eggs-benedict").expect(200)
    expect(r.body.priceCents).toBe(1250)
    await request(app).get("/api/dishes/nope").expect(404)
    await request(app).get("/api/dishes/" + encodeURIComponent("$where")).expect(400)
  })
})

describe("orders: the server sets the prices", () => {
  const base = { name: "Ada Lovelace", phone: "+44 20 7946 0000", pickupAt: "12:30" }

  it("ignores any price the client sends and totals from the database", async () => {
    const r = await request(app)
      .post("/api/orders")
      .send({ ...base, totalCents: 1, items: [{ slug: "fish-and-chips", qty: 2, priceCents: 1 }, { slug: "ruby-citrus-fizz", qty: 1 }, { slug: "fish-and-chips", qty: 1 }] })
      .expect(201)
    expect(r.body.totalCents).toBe(3 * 1700 + 750)
    expect(r.body.items).toEqual([
      { slug: "fish-and-chips", name: "Fish & Chips", unitCents: 1700, qty: 3, lineCents: 5100 },
      { slug: "ruby-citrus-fizz", name: "Ruby Citrus Fizz", unitCents: 750, qty: 1, lineCents: 750 },
    ])
    expect((await Order.findOne({ code: r.body.code }))!.totalCents).toBe(5850)
  })

  it("refuses sold-out and unknown dishes, bad quantities and impossible pickup times", async () => {
    await Dish.updateOne({ slug: "eggs-benedict" }, { available: false })
    await request(app).post("/api/orders").send({ ...base, items: [{ slug: "eggs-benedict", qty: 1 }] }).expect(409)
    await request(app).post("/api/orders").send({ ...base, items: [{ slug: "unicorn-steak", qty: 1 }] }).expect(400)
    await request(app).post("/api/orders").send({ ...base, items: [{ slug: "espresso", qty: 0 }] }).expect(400)
    await request(app).post("/api/orders").send({ ...base, items: [{ slug: "espresso", qty: 1.5 }] }).expect(400)
    await request(app).post("/api/orders").send({ ...base, items: [] }).expect(400)
    await request(app).post("/api/orders").send({ ...base, pickupAt: "16:00", items: [{ slug: "espresso", qty: 1 }] }).expect(400)
    await request(app).post("/api/orders").send({ ...base, pickupAt: "09:00", items: [{ slug: "espresso", qty: 1 }] }).expect(400)
    expect(await Order.countDocuments()).toBe(0)
  })

  it("lists only the collection times still possible today", async () => {
    const r = await request(app).get("/api/orders/pickup-times").expect(200)
    expect(r.body.times[0]).toBe("12:00")
    expect(r.body.times).not.toContain("16:00")
  })
})

describe("newsletter and contact", () => {
  it("subscribes once, answering the same the second time", async () => {
    await request(app).post("/api/newsletter").send({ email: "Guest@Example.com" }).expect(201)
    await request(app).post("/api/newsletter").send({ email: "guest@example.com" }).expect(201)
    expect(await Subscriber.countDocuments()).toBe(1)
    await request(app).post("/api/newsletter").send({ email: "not-an-email" }).expect(400)
  })

  it("stores a contact message and validates it", async () => {
    await request(app).post("/api/contact").send({ name: "Grace", email: "grace@example.com", message: "Do you have a private dining room?" }).expect(201)
    const bad = await request(app).post("/api/contact").send({ name: "G", email: "x", message: "hi" }).expect(400)
    expect(bad.body.details.map((d: { field: string }) => d.field).sort()).toEqual(["email", "message", "name"])
    // the honeypot field catches bots
    await request(app).post("/api/contact").send({ name: "Bot", email: "bot@example.com", message: "Buy cheap things now!!", website: "spam.example" }).expect(400)
    expect(await Message.countDocuments()).toBe(1)
  })
})

describe("security basics", () => {
  it("only answers CORS for configured origins", async () => {
    const ok = await request(app).get("/api/health").set("Origin", "https://codelady-ship.github.io")
    expect(ok.headers["access-control-allow-origin"]).toBe("https://codelady-ship.github.io")
    const no = await request(app).get("/api/health").set("Origin", "https://evil.example")
    expect(no.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("sets helmet headers and hides the framework", async () => {
    const r = await request(app).get("/api/health")
    expect(r.headers["x-content-type-options"]).toBe("nosniff")
    expect(r.headers["x-powered-by"]).toBeUndefined()
  })

  it("rate-limits sign-in attempts", async () => {
    const limited = makeApp(testConfig(), { rateLimits: true })
    for (let i = 0; i < 10; i++) await request(limited).post("/api/auth/login").send({ email: "x@example.com", password: "wrong" }).expect(401)
    await request(limited).post("/api/auth/login").send({ email: "x@example.com", password: "wrong" }).expect(429)
  })

  it("rejects malformed JSON cleanly", async () => {
    await request(app).post("/api/contact").set("Content-Type", "application/json").send("{bad").expect(400)
  })
})
