/** Paper grain, pebbled leather and walnut grain, painted once on canvases. */

export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function make(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, r: () => number) => void): string {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")
  if (!ctx) return "none"
  paint(ctx, rng(w * 31 + h))
  return "url(" + c.toDataURL("image/png") + ")"
}

export function paintTextures() {
  const grain = make(240, 240, (ctx, r) => {
    const img = ctx.createImageData(240, 240)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + r() * 120
      img.data[i] = v
      img.data[i + 1] = v * 0.92
      img.data[i + 2] = v * 0.8
      img.data[i + 3] = r() < 0.5 ? 26 : 10
    }
    ctx.putImageData(img, 0, 0)
    for (let i = 0; i < 90; i++) {
      const x = r() * 240
      const y = r() * 240
      const a = r() * Math.PI
      const l = 4 + r() * 16
      ctx.strokeStyle = "rgba(110,80,40," + (0.05 + r() * 0.12) + ")"
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 2, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
      ctx.stroke()
    }
  })
  // pebbled leather: many soft cells with a lit edge and a dark crease
  const leather = make(220, 220, (ctx, r) => {
    ctx.fillStyle = "#808080"
    ctx.fillRect(0, 0, 220, 220)
    for (let i = 0; i < 900; i++) {
      const x = r() * 220
      const y = r() * 220
      const rad = 2 + r() * 5
      const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 0, x, y, rad)
      g.addColorStop(0, "rgba(255,255,255,.22)")
      g.addColorStop(0.7, "rgba(128,128,128,0)")
      g.addColorStop(1, "rgba(0,0,0,.28)")
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, rad, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  const walnut = make(900, 600, (ctx, r) => {
    ctx.fillStyle = "#808080"
    ctx.fillRect(0, 0, 900, 600)
    for (let i = 0; i < 140; i++) {
      const y0 = r() * 600
      ctx.strokeStyle = r() < 0.5 ? "rgba(0,0,0," + (0.1 + r() * 0.2) + ")" : "rgba(255,230,200," + (0.05 + r() * 0.1) + ")"
      ctx.lineWidth = 0.5 + r() * 2.5
      ctx.beginPath()
      ctx.moveTo(0, y0)
      const ph = r() * 10
      for (let x = 0; x <= 900; x += 30) ctx.lineTo(x, y0 + Math.sin(x / 140 + ph) * 9 + Math.sin(x / 37 + i) * 2)
      ctx.stroke()
    }
  })
  return { grain, leather, walnut }
}
