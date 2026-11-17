import mongoose from "mongoose"
import { createApp } from "./app.js"
import { loadConfig } from "./config.js"

const cfg = loadConfig()

mongoose.set("strictQuery", true)
await mongoose.connect(cfg.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 })
// Build unique indexes before taking traffic: the reservation counter depends on them.
await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()))

const server = createApp(cfg).listen(cfg.PORT, () => {
  console.log("[api] listening on port " + cfg.PORT)
})

const stop = () => {
  server.close(() => {
    mongoose.disconnect().finally(() => process.exit(0))
  })
}
process.on("SIGTERM", stop)
process.on("SIGINT", stop)
