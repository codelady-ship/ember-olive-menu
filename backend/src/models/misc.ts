import { Schema, model } from "mongoose"

const subscriberSchema = new Schema(
  { email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 } },
  { timestamps: true },
)
export const Subscriber = model("Subscriber", subscriberSchema)

const messageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    subject: { type: String, trim: true, maxlength: 120, default: "" },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
)
export const Message = model("Message", messageSchema)

const adminSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // "demo" = the public read-only demo admin: can open every admin page, every write answers 403.
    role: { type: String, enum: ["admin", "demo"], default: "admin" },
  },
  { timestamps: true },
)
export const Admin = model("Admin", adminSchema)
