/** Serve frontend/dist under /ember-olive-menu/ like GitHub Pages does.  node serve.mjs [port] */
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../frontend/dist")
const BASE = "/ember-olive-menu/"
const port = Number(process.argv[2] || 4319)
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".json": "application/json" }

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0])
    if (!url.startsWith(BASE)) {
      res.writeHead(302, { Location: BASE }).end()
      return
    }
    let file = path.join(root, url.slice(BASE.length))
    if (!file.startsWith(root)) return res.writeHead(403).end()
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html")
    if (!fs.existsSync(file)) return res.writeHead(404).end("not found")
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" })
    fs.createReadStream(file).pipe(res)
  })
  .listen(port, () => console.log("serving " + root + " at http://localhost:" + port + BASE))
