import { Schema, model } from "mongoose"

const lineSchema = new Schema(
  {
    slug: { type: String, required: true },
    name: { type: String, required: true },
    unitCents: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    lineCents: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const orderSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    type: { type: String, enum: ["takeaway"], default: "takeaway" },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120, default: "" },
    pickupAt: { type: String, required: true }, // HH:mm today, restaurant time zone
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    items: { type: [lineSchema], required: true },
    totalCents: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["new", "preparing", "ready", "collected", "cancelled"], default: "new" },
  },
  { timestamps: true },
)

export const Order = model("Order", orderSchema)
