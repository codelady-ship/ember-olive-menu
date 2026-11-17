import { Schema, model } from "mongoose"
import { ALLERGENS, BADGES, EFFECTS } from "../lib/menu-enums.js"

const dishSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    section: { type: String, required: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 400, default: "" },
    story: { type: String, trim: true, maxlength: 1200, default: "" },
    /** Price in minor units (pence) so money is never a float. */
    priceCents: { type: Number, required: true, min: 0, max: 100_000 },
    allergens: [{ type: String, enum: ALLERGENS }],
    badges: [{ type: String, enum: BADGES }],
    available: { type: Boolean, default: true },
    /** Featured dishes get their own spread in the book, in `featuredOrder`. */
    featured: { type: Boolean, default: false },
    featuredOrder: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
    effect: { type: String, enum: EFFECTS, default: "none" },
    image: { type: String, trim: true, default: "" },
    depthImage: { type: String, trim: true, default: "" },
    video: { type: String, trim: true, default: "" },
    alt: { type: String, trim: true, maxlength: 200, default: "" },
  },
  { timestamps: true },
)
dishSchema.index({ featured: 1, featuredOrder: 1 })

export const Dish = model("Dish", dishSchema)
