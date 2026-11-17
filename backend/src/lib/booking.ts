import { Slot } from "../models/Reservation.js"

/**
 * Take `party` seats in a slot, atomically. Returns false when the slot does
 * not have that many seats left.
 *
 * 1. Make sure the slot's counter exists (an upsert; a parallel upsert that
 *    loses the race hits the unique index and is ignored).
 * 2. Increment it only if the result still fits: one conditional `$inc`,
 *    which MongoDB applies to a single document atomically.
 */
export async function takeSeats(date: string, time: string, party: number, capacity: number): Promise<boolean> {
  if (party > capacity) return false
  try {
    await Slot.updateOne({ date, time }, { $setOnInsert: { booked: 0 } }, { upsert: true })
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e
  }
  const res = await Slot.findOneAndUpdate({ date, time, booked: { $lte: capacity - party } }, { $inc: { booked: party } }, { new: true })
  return !!res
}

/** Give seats back (a cancelled booking, or a booking that failed to save). */
export async function releaseSeats(date: string, time: string, party: number): Promise<void> {
  await Slot.updateOne({ date, time, booked: { $gte: party } }, { $inc: { booked: -party } })
}

/** Seats taken per time on a date. */
export async function bookedOn(date: string): Promise<Map<string, number>> {
  const rows = await Slot.find({ date }).lean()
  return new Map(rows.map((r) => [r.time, r.booked]))
}
