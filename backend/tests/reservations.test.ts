import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Reservation, Slot } from "../src/models/Reservation.js"
import { isRealDate } from "../src/lib/time.js"
import { login, makeApp, resetDb, startDb, stopDb } from "./helpers.js"

// capacity per slot is 10 and the largest online party is 8 (see helpers)
const app = makeApp()
const guest = (over: object = {}) => ({ name: "Ada Lovelace", email: "ada@example.com", date: "2027-03-05", time: "19:00", partySize: 2, ...over })

beforeAll(startDb)
afterAll(stopDb)
beforeEach(resetDb)

describe("date validation", () => {
  it("knows which dates are real", () => {
    expect(isRealDate("2027-03-05")).toBe(true)
    expect(isRealDate("2028-02-29")).toBe(true)
    expect(isRealDate("2027-02-29")).toBe(false)
    expect(isRealDate("2027-04-31")).toBe(false)
    expect(isRealDate("2027-13-01")).toBe(false)
    expect(isRealDate("2027-3-5")).toBe(false)
  })

  it("refuses impossible, past, closed, too-far and off-menu bookings", async () => {
    const cases: [object, RegExp][] = [
      [{ date: "2027-02-30" }, /does not exist/],
      [{ date: "2027-03-01" }, /passed/],
      [{ date: "2027-03-08" }, /Mondays/],
      [{ date: "2028-03-05" }, /days ahead/],
      [{ time: "19:15" }, /seatings/],
      [{ partySize: 9 }, /call us/],
      [{ partySize: 0 }, /check/],
      [{ date: "2027-03-02", time: "09:00" }, /seatings/],
    ]
    for (const [over, msg] of cases) {
      const r = await request(app).post("/api/reservations").send(guest(over))
      expect(r.status, JSON.stringify(over)).toBe(400)
      expect(r.body.error).toMatch(msg)
    }
    expect(await Reservation.countDocuments()).toBe(0)
  })

  it("books a table and shows the seats left", async () => {
    const r = await request(app).post("/api/reservations").send(guest({ partySize: 4 })).expect(201)
    expect(r.body.code).toMatch(/^EO-[A-Z2-9]{6}$/)
    const a = await request(app).get("/api/reservations/availability?date=2027-03-05").expect(200)
    const seven = a.body.slots.find((s: { time: string }) => s.time === "19:00")
    expect(seven).toMatchObject({ seatsLeft: 6, available: true })
    const closed = await request(app).get("/api/reservations/availability?date=2027-03-08").expect(200)
    expect(closed.body.slots.every((s: { available: boolean }) => !s.available)).toBe(true)
    await request(app).get("/api/reservations/availability?date=2027-02-31").expect(400)
  })
})

describe("no overbooking", () => {
  it("lets exactly as many parallel bookings through as the slot has seats", async () => {
    // 12 parties of 2 race for a slot of 10 seats: exactly 5 may win.
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => request(app).post("/api/reservations").send(guest({ email: "g" + i + "@example.com" }))))
    const codes = results.map((r) => r.status).sort()
    expect(codes.filter((c) => c === 201)).toHaveLength(5)
    expect(codes.filter((c) => c === 409)).toHaveLength(7)
    expect(await Reservation.countDocuments({ date: "2027-03-05", time: "19:00" })).toBe(5)
    expect((await Slot.findOne({ date: "2027-03-05", time: "19:00" }))!.booked).toBe(10)
  })

  it("fills a slot with mixed party sizes without going over", async () => {
    const sizes = [3, 4, 2, 5, 1, 3, 2, 4]
    const results = await Promise.all(sizes.map((partySize, i) => request(app).post("/api/reservations").send(guest({ partySize, email: "m" + i + "@example.com" }))))
    const seated = results.filter((r) => r.status === 201).reduce((s, r) => s + r.body.partySize, 0)
    expect(seated).toBeLessThanOrEqual(10)
    const slot = await Slot.findOne({ date: "2027-03-05", time: "19:00" })
    expect(slot!.booked).toBe(seated)
  })

  it("gives seats back when the restaurant cancels, and takes them again on restore", async () => {
    const token = await login(app)
    const r = await request(app).post("/api/reservations").send(guest({ partySize: 8 })).expect(201)
    await request(app).post("/api/reservations").send(guest({ partySize: 4 })).expect(409)
    const id = (await Reservation.findOne({ code: r.body.code }))!._id
    await request(app).patch("/api/admin/reservations/" + id).set("Authorization", "Bearer " + token).send({ status: "cancelled" }).expect(200)
    await request(app).post("/api/reservations").send(guest({ partySize: 4 })).expect(201)
    // restoring the 8 no longer fits beside the 4
    await request(app).patch("/api/admin/reservations/" + id).set("Authorization", "Bearer " + token).send({ status: "confirmed" }).expect(409)
    expect((await Slot.findOne({ date: "2027-03-05", time: "19:00" }))!.booked).toBe(4)
  })
})
