/**
 * Dates and opening hours, all in the restaurant's own time zone.
 * Dates travel as "YYYY-MM-DD" strings and times as "HH:mm" so nothing is
 * shifted by the server's or the browser's zone.
 */

/** Seatings: lunch 12:00–14:00 and dinner 18:00–21:30, every half hour. */
export const SLOT_TIMES = ["12:00", "12:30", "13:00", "13:30", "14:00", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"]
/** Takeaway collection, every quarter hour while the kitchen is open. */
export const PICKUP_TIMES = (() => {
  const out: string[] = []
  const add = (from: number, to: number) => {
    for (let m = from; m <= to; m += 15) out.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"))
  }
  add(12 * 60, 14 * 60 + 30)
  add(18 * 60, 21 * 60 + 45)
  return out
})()
/** 0 = Sunday … 6 = Saturday. The restaurant is closed on Mondays. */
export const CLOSED_WEEKDAYS = [1]

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** True only for a date that exists on the calendar (no 2026-02-30). */
export function isRealDate(s: string): boolean {
  const m = DATE_RE.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 2000 || y > 2100) return false
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

export const isTime = (s: string) => TIME_RE.test(s)
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
export const weekday = (date: string) => new Date(date + "T00:00:00Z").getUTCDay()

/** Whole days from a to b (both YYYY-MM-DD). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000)

/** "Now" in the restaurant's zone, as a date string and minutes after midnight. */
export function zonedNow(tz: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00"
  return { date: get("year") + "-" + get("month") + "-" + get("day"), minutes: Number(get("hour")) * 60 + Number(get("minute")) }
}

export type SlotRules = { tz: string; daysAhead: number; now: Date }

/** Why a table cannot be booked at this date and time, or null when it can. */
export function slotProblem(date: string, time: string, r: SlotRules): string | null {
  if (!isRealDate(date)) return "That date does not exist."
  if (!isTime(time) || !SLOT_TIMES.includes(time)) return "Please choose one of the listed seatings."
  const today = zonedNow(r.tz, r.now)
  const ahead = daysBetween(today.date, date)
  if (ahead < 0) return "That date has passed."
  if (ahead > r.daysAhead) return "We take bookings up to " + r.daysAhead + " days ahead."
  if (CLOSED_WEEKDAYS.includes(weekday(date))) return "We are closed on Mondays."
  if (ahead === 0 && toMinutes(time) <= today.minutes + 30) return "That seating has already started or is too soon to book online."
  return null
}

/** Why an order cannot be collected at this time today, or null when it can. */
export function pickupProblem(time: string, r: Omit<SlotRules, "daysAhead">): string | null {
  if (!isTime(time) || !PICKUP_TIMES.includes(time)) return "Please choose one of the listed collection times."
  const today = zonedNow(r.tz, r.now)
  if (CLOSED_WEEKDAYS.includes(weekday(today.date))) return "We are closed today."
  if (toMinutes(time) < today.minutes + 20) return "Please allow at least 20 minutes for the kitchen."
  return null
}
