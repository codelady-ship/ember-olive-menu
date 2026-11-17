import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import bcrypt from "bcryptjs"
import { MongoMemoryServer } from "mongodb-memory-server"
import mongoose from "mongoose"
import request from "supertest"
import { createApp, type AppOptions } from "../src/app.js"
import { loadConfig, type Config } from "../src/config.js"
import { seedMenu } from "../src/seed/seed.js"
import { Admin } from "../src/models/misc.js"

/** Tuesday 2 March 2027, 09:00 in London. */
export const NOW = new Date("2027-03-02T09:00:00Z")
export const ADMIN = { email: "chef@example.com", password: "a-long-test-password" }

let mongod: MongoMemoryServer | null = null

export async function startDb() {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()))
}

export async function stopDb() {
  await mongoose.disconnect()
  await mongod?.stop()
  mongod = null
}

export async function resetDb() {
  const cols = await mongoose.connection.db!.collections()
  await Promise.all(cols.map((c) => c.deleteMany({})))
  await seedMenu()
  await Admin.create({ email: ADMIN.email, passwordHash: await bcrypt.hash(ADMIN.password, 4) })
}

export function testConfig(over: Partial<Record<string, string>> = {}): Config {
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "eo-uploads-"))
  return loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-that-is-definitely-longer-than-32-chars",
    CORS_ORIGINS: "http://localhost:5173,https://codelady-ship.github.io",
    RES_SLOT_CAPACITY: "10",
    RES_MAX_PARTY: "8",
    RESTAURANT_TZ: "Europe/London",
    UPLOAD_DIR: uploads,
    MAX_UPLOAD_MB: "1",
    ...over,
  } as NodeJS.ProcessEnv)
}

export function makeApp(cfg = testConfig(), opts: AppOptions = {}) {
  return createApp(cfg, { now: () => NOW, rateLimits: false, ...opts })
}

export async function login(app: ReturnType<typeof makeApp>) {
  const r = await request(app).post("/api/auth/login").send(ADMIN)
  return r.body.token as string
}
