import { Schema, model } from "mongoose"

const reservationSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD, restaurant time zone
    time: { type: String, required: true }, // HH:mm
    partySize: { type: Number, required: true, min: 1 },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    status: { type: String, enum: ["confirmed", "cancelled", "seated", "no-show"], default: "confirmed" },
  },
  { timestamps: true },
)

export const Reservation = model("Reservation", reservationSchema)

/**
 * One counter per (date, time) slot. Seats are taken with a single conditional
 * `$inc`, so two parallel bookings can never both squeeze into the last seats.
 */
const slotSchema = new Schema({
  date: { type: String, required: true },
  time: { type: String, required: true },
  booked: { type: Number, required: true, default: 0, min: 0 },
})
slotSchema.index({ date: 1, time: 1 }, { unique: true })
export const Slot = model("Slot", slotSchema)
