/**
 * Ember & Olive asset pipeline.
 *
 * Turns the licensed source photos (see docs/CREDITS.md) into what the book needs:
 *   frontend/public/menu/<slug>.webp        transparent cut-out, 1024 x 1024
 *   frontend/public/menu/<slug>-depth.webp  greyscale height map (white = high)
 *
 *   node prepare-assets.mjs            build all
 *   node prepare-assets.mjs --debug    also write overlays to tools/out/ to check the masks
 *
 * Plates: the plate is an ellipse in the photo (it was shot at an angle). The
 * ellipse is cut out, stretched back to a circle so the dish reads as top-down,
 * and optional polygons add food that hangs over the rim. Glasses on black:
 * alpha comes from brightness, so the glass stays see-through.
 *
 * Depth: plates get a shallow well with a raised rim; whatever is not plate
 * coloured is food, blurred into soft mounds, plus a little detail from the
 * photo's own light. Glasses get a cylinder profile across each row.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(here, "sources")
const OUT = path.resolve(here, "../frontend/public/menu")
const DBG = path.join(here, "out")
const SIZE = 1024
const debug = process.argv.includes("--debug")

/** Fractions of the source image. */
export const DISHES = [
  {
    slug: "truffle-tagliatelle",
    file: "Tagliatelle_al_tartufo.jpg",
    kind: "plate",
    ellipse: { cx: 0.505, cy: 0.483, rx: 0.49, ry: 0.375 },
  },
  {
    slug: "eggs-benedict",
    file: "Eggs_Benedict_the_M_S_Caf_.jpg",
    kind: "plate",
    ellipse: { cx: 0.516, cy: 0.543, rx: 0.34, ry: 0.377 },
  },
  {
    slug: "fish-and-chips",
    file: "Fish_and_chips_plate_with_peas.jpg",
    kind: "plate",
    ellipse: { cx: 0.524, cy: 0.552, rx: 0.34, ry: 0.387 },
  },
  {
    slug: "ruby-citrus-fizz",
    file: "Red_cocktail_in_stylish_glass_with_ice_and_orange_slice_on_top.jpg",
    kind: "glass",
    crop: { l: 0.33, t: 0.02, w: 0.34, h: 0.98 },
  },
]

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

async function blurGray(buf, w, h, sigma) {
  return new Uint8Array(await sharp(Buffer.from(buf), { raw: { width: w, height: h, channels: 1 } }).blur(sigma).toColourspace("b-w").raw().toBuffer())
}

async function plate(d) {
  const img = sharp(path.join(SRC, d.file)).rotate()
  const meta = await img.metadata()
  const W0 = meta.width
  const H0 = meta.height
  const e = d.ellipse
  const rxPx = e.rx * W0
  const ryPx = e.ry * H0
  // Stretch so the ellipse becomes a circle of radius rxPx (top-down look).
  const sy = rxPx / ryPx
  const W1 = W0
  const H1 = Math.round(H0 * sy)
  const { data, info } = await img.resize(W1, H1, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const cx = e.cx * W1
  const cy = e.cy * H1
  const R = rxPx
  // square crop around the circle, padded with transparency where the photo ends
  const side = Math.ceil(R * 2 * 1.02)
  const x0 = Math.round(cx - side / 2)
  const y0 = Math.round(cy - side / 2)
  const rgba = new Uint8Array(side * side * 4)
  const alpha = new Float32Array(side * side)
  const feather = R * 0.012
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const sx = x0 + x
      const syy = y0 + y
      const o = (y * side + x) * 4
      if (sx < 0 || syy < 0 || sx >= info.width || syy >= info.height) continue
      const i = (syy * info.width + sx) * 3
      const r = Math.hypot(sx - cx, syy - cy)
      const a = 1 - smooth(R - feather, R + feather, r)
      rgba[o] = data[i]
      rgba[o + 1] = data[i + 1]
      rgba[o + 2] = data[i + 2]
      rgba[o + 3] = Math.round(a * 255)
      alpha[y * side + x] = a
    }
  }
  // plate colour: median of a ring just inside the rim
  const ring = []
  for (let y = 0; y < side; y += 2)
    for (let x = 0; x < side; x += 2) {
      const r = Math.hypot(x - side / 2, y - side / 2) / R
      if (r > 0.86 && r < 0.95) {
        const o = (y * side + x) * 4
        if (rgba[o + 3] > 200) ring.push([rgba[o], rgba[o + 1], rgba[o + 2]])
      }
    }
  const med = [0, 1, 2].map((c) => ring.map((p) => p[c]).sort((a, b) => a - b)[ring.length >> 1] || 230)
  // food mask: far from plate colour
  const food = new Uint8Array(side * side)
  const lum = new Uint8Array(side * side)
  for (let p = 0; p < side * side; p++) {
    const o = p * 4
    const dr = rgba[o] - med[0]
    const dg = rgba[o + 1] - med[1]
    const db = rgba[o + 2] - med[2]
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    const r = Math.hypot((p % side) - side / 2, Math.floor(p / side) - side / 2) / R
    food[p] = Math.round(255 * smooth(d.foodLo ?? 50, d.foodHi ?? 100, dist) * (r < 0.95 ? 1 : 0) * alpha[p])
    lum[p] = Math.round(0.3 * rgba[o] + 0.59 * rgba[o + 1] + 0.11 * rgba[o + 2])
  }
  // clean the mask: a light blur and a hard-ish threshold removes plate speckle
  const soft0 = await blurGray(food, side, side, side * 0.006)
  const soft = new Uint8Array(side * side)
  for (let p = 0; p < soft.length; p++) soft[p] = Math.round(255 * smooth(0.4, 0.7, soft0[p] / 255))
  const dome = await blurGray(soft, side, side, side * 0.05)
  const near = await blurGray(soft, side, side, side * 0.016)
  const lumBlur = await blurGray(lum, side, side, side * 0.008)
  const depth = new Uint8Array(side * side)
  for (let p = 0; p < side * side; p++) {
    const r = Math.hypot((p % side) - side / 2, Math.floor(p / side) - side / 2) / R
    // shallow well, a soft rim, then the outer lip falling away
    const plateH = 0.05 + 0.08 * smooth(0.66, 0.88, r) - 0.06 * smooth(0.94, 1.0, r)
    const inFood = smooth(0.0, 0.85, near[p] / 255)
    const f = Math.pow(clamp((dome[p] / 255) * 1.08, 0, 1), 1.35) * inFood
    const detail = ((lum[p] - lumBlur[p]) / 255) * 0.3 * (soft[p] / 255)
    const h = plateH + Math.pow(f, 0.85) * 0.8 + detail
    depth[p] = Math.round(clamp(h, 0, 1) * 255 * (alpha[p] > 0.02 ? 1 : 0))
  }
  // soften what is left of the cliffs so texels never stretch into streaks
  return { rgba, depth: await blurGray(depth, side, side, side * 0.005), side, food }
}

async function glass(d) {
  const img = sharp(path.join(SRC, d.file)).rotate()
  const meta = await img.metadata()
  const c = d.crop
  const left = Math.round(c.l * meta.width)
  const top = Math.round(c.t * meta.height)
  const w = Math.round(c.w * meta.width)
  const h = Math.round(c.h * meta.height)
  const side = Math.max(w, h)
  const { data } = await img.extract({ left, top, width: w, height: h }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const rgba = new Uint8Array(side * side * 4)
  const a8 = new Uint8Array(side * side)
  const ox = Math.round((side - w) / 2)
  const oy = Math.round((side - h) / 2)
  // the background is near-black: brightness becomes opacity, colour is un-multiplied
  const floor = 50
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      const R = data[i]
      const G = data[i + 1]
      const B = data[i + 2]
      const m = Math.max(R, G, B)
      let a = clamp((m - floor) / (215 - floor), 0, 1)
      a = Math.pow(a, 0.75)
      const o = ((y + oy) * side + (x + ox)) * 4
      const un = (v) => (a > 0.01 ? clamp(Math.round((v - floor * (1 - a)) / a), 0, 255) : 0)
      rgba[o] = un(R)
      rgba[o + 1] = un(G)
      rgba[o + 2] = un(B)
      rgba[o + 3] = Math.round(a * 255)
      a8[(y + oy) * side + (x + ox)] = Math.round(a * 255)
    }
  // silhouette: blur the alpha so thin glass edges count as glass, then a cylinder per row
  const sil = await blurGray(a8, side, side, side * 0.01)
  const depth = new Uint8Array(side * side)
  for (let y = 0; y < side; y++) {
    let l = -1
    let r = -1
    for (let x = 0; x < side; x++) if (sil[y * side + x] > 28) (l < 0 && (l = x), (r = x))
    if (l < 0 || r - l < 4) continue
    const mid = (l + r) / 2
    const hw = (r - l) / 2
    for (let x = l; x <= r; x++) {
      const u = (x - mid) / hw
      depth[y * side + x] = Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * 255 * Math.min(1, hw / (side * 0.1)))
    }
  }
  return { rgba, depth: await blurGray(depth, side, side, 2), side, food: a8 }
}

async function write(d, res) {
  const { rgba, depth, side } = res
  await sharp(Buffer.from(rgba), { raw: { width: side, height: side, channels: 4 } })
    .resize(SIZE, SIZE)
    .webp({ quality: 84, alphaQuality: 90, effort: 6 })
    .toFile(path.join(OUT, d.slug + ".webp"))
  await sharp(Buffer.from(depth), { raw: { width: side, height: side, channels: 1 } })
    .resize(512, 512)
    .webp({ quality: 88, effort: 6 })
    .toFile(path.join(OUT, d.slug + "-depth.webp"))
  if (debug) {
    await sharp(Buffer.from(rgba), { raw: { width: side, height: side, channels: 4 } })
      .resize(512, 512)
      .flatten({ background: "#efe3c4" })
      .jpeg()
      .toFile(path.join(DBG, d.slug + "-on-paper.jpg"))
    await sharp(Buffer.from(depth), { raw: { width: side, height: side, channels: 1 } }).resize(512, 512).jpeg().toFile(path.join(DBG, d.slug + "-depth.jpg"))
  }
}

fs.mkdirSync(OUT, { recursive: true })
if (debug) fs.mkdirSync(DBG, { recursive: true })
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7)
for (const d of DISHES) {
  if (only && d.slug !== only) continue
  if (!fs.existsSync(path.join(SRC, d.file))) {
    console.warn("skip " + d.slug + ": put " + d.file + " in tools/sources/ (see docs/CREDITS.md)")
    continue
  }
  const res = d.kind === "glass" ? await glass(d) : await plate(d)
  await write(d, res)
  console.log("built " + d.slug)
}
