/**
 * Placeholder art made from the dish cut-outs (until the Flow assets arrive):
 *   frontend/public/og.jpg                          1200 x 630 social card
 *   frontend/public/promo/menu-story-poster.webp    720 x 1280 (9:16) poster for the story film
 *   frontend/public/favicon.svg
 *   node make-promo.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const here = path.dirname(fileURLToPath(import.meta.url))
const PUB = path.resolve(here, "../frontend/public")
const menu = (s) => path.join(PUB, "menu", s + ".webp")

const table = (w, h) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <radialGradient id="lamp" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#4a3522"/><stop offset=".55" stop-color="#22180f"/><stop offset="1" stop-color="#0a0705"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e2a6"/><stop offset=".45" stop-color="#d4ab55"/><stop offset="1" stop-color="#9a6f28"/></linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#lamp)"/>
  ${Array.from({ length: 40 }, (_, i) => `<path d="M0 ${(i * h) / 40 + 7} Q ${w / 2} ${(i * h) / 40 + (i % 2 ? 10 : -6)} ${w} ${(i * h) / 40 + 3}" stroke="rgba(0,0,0,.18)" stroke-width="${1 + (i % 3)}" fill="none"/>`).join("")}
</svg>`)

const text = (w, h, lines) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e2a6"/><stop offset=".5" stop-color="#d4ab55"/><stop offset="1" stop-color="#a87b2c"/></linearGradient></defs>
  ${lines.map((l) => `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor || "middle"}" font-family="Georgia, 'Times New Roman', serif" font-size="${l.size}" letter-spacing="${l.ls || 0}" fill="${l.fill || "url(#g)"}" font-weight="${l.weight || 400}">${l.t}</text>`).join("")}
</svg>`)

async function og() {
  const W = 1200
  const H = 630
  const plate = await sharp(menu("truffle-tagliatelle")).resize(470, 470).toBuffer()
  const glass = await sharp(menu("ruby-citrus-fizz")).resize(360, 360).toBuffer()
  const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="520" height="520"><defs><radialGradient id="s"><stop offset="0" stop-color="rgba(0,0,0,.7)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient></defs><circle cx="260" cy="260" r="250" fill="url(#s)"/></svg>`)
  await sharp(table(W, H))
    .composite([
      { input: shadow, left: 655, top: 105 },
      { input: plate, left: 660, top: 80 },
      { input: glass, left: 470, top: 250 },
      {
        input: text(W, H, [
          { t: "EMBER", x: 90, y: 250, size: 92, ls: 14, anchor: "start", weight: 700 },
          { t: "&amp; OLIVE", x: 90, y: 350, size: 92, ls: 14, anchor: "start", weight: 700 },
          { t: "A menu you can turn — dishes rise from the page", x: 92, y: 420, size: 28, anchor: "start", fill: "#e9dbbd" },
          { t: "Wood fire · Olive oil · London", x: 92, y: 470, size: 22, ls: 4, anchor: "start", fill: "#bba57e" },
        ]),
        left: 0,
        top: 0,
      },
    ])
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(path.join(PUB, "og.jpg"))
}

async function poster() {
  const W = 720
  const H = 1280
  const dishes = await Promise.all(
    [
      ["truffle-tagliatelle", 420],
      ["eggs-benedict", 300],
      ["fish-and-chips", 300],
    ].map(([s, z]) => sharp(menu(s)).resize(z, z).toBuffer()),
  )
  await sharp(table(W, H))
    .composite([
      { input: dishes[0], left: 150, top: 330 },
      { input: dishes[1], left: 20, top: 760 },
      { input: dishes[2], left: 400, top: 760 },
      {
        input: text(W, H, [
          { t: "EMBER &amp; OLIVE", x: 360, y: 190, size: 62, ls: 8, weight: 700 },
          { t: "the menu, in motion", x: 360, y: 250, size: 30, fill: "#e9dbbd" },
          { t: "▶  Film coming soon", x: 360, y: 1180, size: 26, fill: "#bba57e" },
        ]),
        left: 0,
        top: 0,
      },
    ])
    .webp({ quality: 80 })
    .toFile(path.join(PUB, "promo", "menu-story-poster.webp"))
}

fs.mkdirSync(path.join(PUB, "promo"), { recursive: true })
fs.writeFileSync(
  path.join(PUB, "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#120d09"/><path d="M32 10c7 9 10 15 4 24 0-6-3-9-4-10-2 4-6 6-6 12 0 4 3 7 6 7-9 0-13-6-12-13 2-9 10-11 12-20z" fill="#c9a24a"/><path d="M14 48c8 6 28 6 36 0" stroke="#7d8a3a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>\n`,
)
await og()
await poster()
console.log("og.jpg, promo/menu-story-poster.webp and favicon.svg written")
