import { z } from "zod"

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/ember-olive"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  RES_SLOT_CAPACITY: z.coerce.number().int().min(1).max(500).default(24),
  RES_MAX_PARTY: z.coerce.number().int().min(1).max(50).default(10),
  RES_DAYS_AHEAD: z.coerce.number().int().min(1).max(365).default(90),
  RESTAURANT_TZ: z.string().default("Europe/London"),
  UPLOAD_DIR: z.string().default("uploads"),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(10).default(3),
})

export type Config = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    // Report the names of the bad variables only, never their values.
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
    throw new Error("Invalid environment: " + keys)
  }
  return parsed.data
}

export const corsOrigins = (c: Config) =>
  c.CORS_ORIGINS.split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean)
