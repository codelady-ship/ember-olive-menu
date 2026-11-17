import { Schema, model } from "mongoose"

const sectionSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 60 },
    subtitle: { type: String, trim: true, maxlength: 140, default: "" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export const Section = model("Section", sectionSchema)
