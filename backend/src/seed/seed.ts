/**
 * Load the starter menu (shared/menu.json) into MongoDB.
 * Upserts by slug, so it is safe to run again; it never deletes anything.
 *   npm run seed
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import mongoose from "mongoose"
import { dishInput, sectionInput } from "../lib/schemas.js"
import { Dish } from "../models/Dish.js"
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error("Set MONGODB_URI first.")
    process.exit(1)
  }
  await mongoose.connect(uri)
  const n = await seedMenu()
  console.log("Seeded " + n.sections + " sections and " + n.dishes + " dishes.")
  await mongoose.disconnect()
}
