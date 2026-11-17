import { z } from "zod"
import { ALLERGENS, BADGES, EFFECTS } from "./menu-enums.js"

const text = (max: number) => z.string().trim().max(max)
const email = z.string().trim().toLowerCase().email("Please enter a valid email.").max(120)
const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+()\d\s-]{6,30}$/, "Please enter a valid phone number.")
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and dashes.")
  .min(2)
  .max(60)

/**
 * Where a dish's media may live: a file the API stored (/uploads/<uuid>.ext),
 * a file shipped with the site (menu/<slug>.webp …), or an https URL.
 * Anything else (javascript:, data:, relative tricks) is refused.
 */
export const mediaPath = z
  .string()
  .trim()
  .max(300)
  .regex(/^$|^\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp)$|^menu\/[a-z0-9-]+\.(webp|png|jpg|mp4)$|^https:\/\/[^\s"'<>\\]+$/, "Use an uploaded image, a menu/ asset or an https URL.")

export const sectionInput = z.object({
  slug,
  title: text(60).min(1),
  subtitle: text(140).optional().default(""),
  order: z.number().int().min(0).max(1000).optional().default(0),
})

export const dishInput = z.object({
  slug,
  name: text(80).min(1),
  section: slug,
  description: text(400).optional().default(""),
  story: text(1200).optional().default(""),
  priceCents: z.number().int().min(0).max(100_000),
  allergens: z.array(z.enum(ALLERGENS)).max(14).optional().default([]),
  badges: z.array(z.enum(BADGES)).max(8).optional().default([]),
  available: z.boolean().optional().default(true),
  featured: z.boolean().optional().default(false),
  featuredOrder: z.number().int().min(0).max(1000).optional().default(0),
  order: z.number().int().min(0).max(1000).optional().default(0),
  effect: z.enum(EFFECTS).optional().default("none"),
  image: mediaPath.optional().default(""),
  depthImage: mediaPath.optional().default(""),
  video: mediaPath.optional().default(""),
  alt: text(200).optional().default(""),
})

export const reservationInput = z.object({
  name: text(80).min(2, "Please enter your name."),
  email,
  phone: phone.optional().or(z.literal("")).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker (YYYY-MM-DD)."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Please choose a seating."),
  partySize: z.number().int().min(1, "At least one guest."),
  notes: text(500).optional().default(""),
  // Honeypot: real people never see or fill this field.
  website: z.string().max(0).optional(),
})

export const orderInput = z.object({
  name: text(80).min(2, "Please enter your name."),
  phone,
  email: email.optional().or(z.literal("")).default(""),
  pickupAt: z.string().regex(/^\d{2}:\d{2}$/, "Please choose a collection time."),
  notes: text(500).optional().default(""),
  items: z
    .array(z.object({ slug, qty: z.number().int().min(1).max(20) }))
    .min(1, "Your order is empty.")
    .max(30),
  website: z.string().max(0).optional(),
})

export const newsletterInput = z.object({ email, website: z.string().max(0).optional() })

export const contactInput = z.object({
  name: text(80).min(2, "Please enter your name."),
  email,
  subject: text(120).optional().default(""),
  message: text(2000).min(10, "A few more words, please."),
  website: z.string().max(0).optional(),
})

export const loginInput = z.object({ email, password: z.string().min(1).max(200) })

export const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, "Invalid id.") })
