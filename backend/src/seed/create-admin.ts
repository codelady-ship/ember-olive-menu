/**
 * Create (or reset the password of) the admin account.
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... MONGODB_URI=... npm run create-admin
 * The password is hashed with bcrypt (cost 12) and never printed.
 */
import bcrypt from "bcryptjs"
import mongoose from "mongoose"
import { z } from "zod"
import { Admin } from "../models/misc.js"

const env = z
  .object({
    MONGODB_URI: z.string().min(1),
    ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
    ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters"),
  })
  .safeParse(process.env)

if (!env.success) {
  console.error("Missing or invalid: " + env.error.issues.map((i) => i.path.join(".") + " (" + i.message + ")").join(", "))
  process.exit(1)
}

await mongoose.connect(env.data.MONGODB_URI)
const passwordHash = await bcrypt.hash(env.data.ADMIN_PASSWORD, 12)
await Admin.updateOne({ email: env.data.ADMIN_EMAIL }, { $set: { passwordHash } }, { upsert: true })
console.log("Admin account ready.")
await mongoose.disconnect()
