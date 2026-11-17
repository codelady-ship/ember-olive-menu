import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // one in-memory mongod per file; files run one after another on a low-RAM machine
    fileParallelism: false,
  },
})
