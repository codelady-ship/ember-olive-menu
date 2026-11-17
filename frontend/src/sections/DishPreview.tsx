import * as React from "react"
import { mediaUrl } from "../lib/api"
import { money, type Dish } from "../lib/menu"
import { Crest } from "../book/ornaments"
import type { RiseEngine } from "../three/rise"

/**
 * The dish preview for the plain menu list: the same rise as the book. A dish
 * with a photo and a height map is built by the book's own RiseEngine (photo +
 * depth on a displaced plane, lit from the lamp, steam or fizz); it lifts,
 * gains height and then sways slowly. A dish with no 3D asset gets its best
 * available image (its photo, or the book's crest when there is none) with the
 * same lift and tilt in CSS. Under reduced motion it is a still image.
 *
 * three.js and gsap are only fetched on the first hover, focus or tap.
 */

export type PreviewAsset = "3d" | "photo" | "crest"

/** Which art a dish can show: 3D needs a photo and its height map. */
export function previewAsset(d: Dish): PreviewAsset {
  if (mediaUrl(d.image) && mediaUrl(d.depthImage)) return "3d"
  if (mediaUrl(d.image)) return "photo"
  return "crest"
}

/** A dish's kind for the 3D: a glass stands, a plate lies (same rule as the book). */
const kindOf = (d: Dish) => (d.effect === "fizz" ? "glass" : "plate") as "glass" | "plate"

let enginePromise: Promise<RiseEngine | null> | null = null
/** One RiseEngine (one WebGL canvas) for every preview on the page, made on first use. */
export function loadPreviewEngine(): Promise<RiseEngine | null> {
  if (!enginePromise) {
    let gl = false
    try {
      const c = document.createElement("canvas")
      gl = !!(c.getContext("webgl2") || c.getContext("webgl"))
    } catch {
      gl = false
    }
    const nav = navigator as Navigator & { deviceMemory?: number }
    const lowEnd = (nav.hardwareConcurrency || 8) <= 2 || (nav.deviceMemory ?? 8) <= 2
    enginePromise = !gl || lowEnd ? Promise.resolve(null) : import("../three/rise").then((m) => new m.RiseEngine()).catch(() => null)
  }
  return enginePromise
}

let uid = 0

export default function DishPreview({ dish, active, reduced, id }: { dish: Dish; active: boolean; reduced: boolean; id?: string }) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const boxRef = React.useRef<HTMLDivElement | null>(null)
  const inst = React.useMemo(() => ++uid, [])
  const asset = previewAsset(dish)
  /** "gl": the WebGL rise is showing; "css": the CSS lift is showing; "": flat */
  const [lift, setLift] = React.useState<"" | "gl" | "css">("")

  React.useEffect(() => {
    if (!active) {
      setLift("")
      return
    }
    if (reduced) return
    let live = true
    let raf = 0
    let engine: RiseEngine | null = null
    const key = "list-" + inst + "-" + dish.slug
    const css = () => {
      // next frame, so the lift transitions in from flat
      raf = requestAnimationFrame(() => live && setLift("css"))
    }
    if (asset !== "3d") css()
    else
      loadPreviewEngine().then(async (e) => {
        if (!live) return
        const host = hostRef.current
        const box = boxRef.current
        if (!e || e.lost || !host || !box) return css()
        engine = e
        try {
          await e.attach(host, box, { image: mediaUrl(dish.image), depth: mediaUrl(dish.depthImage), effect: dish.effect, kind: kindOf(dish) }, key)
          if (!live || e.attachedKey !== key) return
          setLift("gl")
          await e.rise()
          // a slow sway, so the height reads from both sides
          const t0 = performance.now()
          const sway = () => {
            if (!live || e.attachedKey !== key) return
            const t = (performance.now() - t0) / 1000
            e.setPointer(0.85 * Math.sin(t * 0.55), 0.35 * Math.sin(t * 0.37 + 1))
            raf = requestAnimationFrame(sway)
          }
          raf = requestAnimationFrame(sway)
        } catch {
          if (live) css() // textures failed: the CSS lift instead
        }
      })
    return () => {
      live = false
      cancelAnimationFrame(raf)
      const e = engine
      // let the card fade first; a new preview may already have taken the canvas
      if (e) window.setTimeout(() => e.attachedKey === key && e.detach(), 240)
    }
  }, [active, reduced, asset, dish, inst])

  const glass = kindOf(dish) === "glass"
  return (
    <div className={"dp-card" + (lift ? " up" : "") + (lift === "gl" ? " gl" : "") + (reduced ? " still" : "")} id={id} data-asset={asset} data-slug={dish.slug}>
      <div className={"dp-fig" + (glass ? " glass" : "")}>
        <div className="dp-printed" />
        <div className="dp-tilt">
          <div className="dp-photo" ref={boxRef}>
            {asset === "crest" ? (
              <div className="dp-crest" role="img" aria-label={dish.name + ": the house crest (no photograph yet)"}>
                <Crest className="dp-crest-svg" />
              </div>
            ) : (
              <img src={mediaUrl(dish.image)} alt={dish.alt || dish.name} width={1024} height={1024} decoding="async" draggable={false} />
            )}
          </div>
        </div>
        <div className="dp-host" ref={hostRef} />
      </div>
      <p className="dp-cap">
        <span>{dish.name}</span> <span className="dp-price">{money(dish.priceCents)}</span>
      </p>
    </div>
  )
}
