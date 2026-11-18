/**
 * Load the starter menu (shared/menu.json) into MongoDB and create the public
 * read-only demo admin (demo@ember-olive.demo / demo1234, role "demo").
 * Upserts, so it is safe to run again; it never deletes anything.
 *   npm run seed            (DEMO_ADMIN=false skips the demo admin)
 */
import bcrypt from "bcryptjs"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import mongoose from "mongoose"
import { dishInput, sectionInput } from "../lib/schemas.js"
import { Dish } from "../models/Dish.js"
import { Admin } from "../models/misc.js"
import { Section } from "../models/Section.js"

const here = path.dirname(fileURLToPath(import.meta.url))
export const MENU_FILE = path.resolve(here, "../../../shared/menu.json")

export async function seedMenu(file = MENU_FILE) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"))
  for (const s of data.sections) {
    const v = sectionInput.parse(s)
    await Section.updateOne({ slug: v.slug }, { $set: v }, { upsert: true })
  }
  for (const d of data.dishes) {
    const v = dishInput.parse(d)
    await Dish.updateOne({ slug: v.slug }, { $set: v }, { upsert: true })
  }
  return { sections: data.sections.length, dishes: data.dishes.length }
}

/** Public by design: shown on the sign-in page. Its role can read everything and write nothing. */
export const DEMO_ADMIN = { email: "demo@ember-olive.demo", password: "demo1234" }

export async function seedDemoAdmin(env: NodeJS.ProcessEnv = process.env) {
  if (env.DEMO_ADMIN === "false") return null
  const existing = await Admin.findOne({ email: DEMO_ADMIN.email }).select("role").lean()
  if (existing && existing.role !== "demo") return null // never downgrade a real admin
  const passwordHash = await bcrypt.hash(DEMO_ADMIN.password, 10)
  await Admin.updateOne({ email: DEMO_ADMIN.email }, { $set: { passwordHash, role: "demo" } }, { upsert: true })
  return DEMO_ADMIN.email
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error("Set MONGODB_URI first.")
    process.exit(1)
  }
  await mongoose.connect(uri)
  const n = await seedMenu()
  console.log("Seeded " + n.sections + " sections and " + n.dishes + " dishes.")
  const demo = await seedDemoAdmin()
  console.log(demo ? "Demo admin ready: " + demo + " (read-only)." : "Demo admin skipped.")
  await mongoose.disconnect()
}
