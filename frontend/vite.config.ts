import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { seo } from "./seo-plugin"

// GitHub Pages serves the site from /ember-olive-menu/. Override with VITE_BASE.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "VITE_")
  const base = command === "build" ? env.VITE_BASE || "/ember-olive-menu/" : "/"
  const siteUrl = env.VITE_SITE_URL || "https://codelady-ship.github.io/ember-olive-menu/"
  return {
    base,
    plugins: [react(), seo(siteUrl)],
    server: { fs: { allow: [".."] } },
    build: {
      target: "es2020",
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          // three.js only loads when a dish rises or the 3D viewer opens
          manualChunks: (id: string) => (id.includes("node_modules/three") ? "three" : id.includes("node_modules/gsap") ? "gsap" : undefined),
        },
      },
    },
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  }
})
