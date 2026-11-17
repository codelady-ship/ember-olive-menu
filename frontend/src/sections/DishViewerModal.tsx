import * as React from "react"
import { mediaUrl } from "../lib/api"
import { money, type Dish } from "../lib/menu"
import type { DishViewer } from "../three/viewer"

/** "View in 3D": a dialog with the dish on a table that can be turned all the way round. */
export default function DishViewerModal({ dish, onClose }: { dish: Dish; onClose: () => void }) {
  const stageRef = React.useRef<HTMLDivElement | null>(null)
  const dialogRef = React.useRef<HTMLDivElement | null>(null)
  const viewer = React.useRef<DishViewer | null>(null)
  const [state, setState] = React.useState<"loading" | "ready" | "fallback">("loading")

  React.useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let gl = false
    try {
      const c = document.createElement("canvas")
      gl = !!(c.getContext("webgl2") || c.getContext("webgl"))
    } catch {
      gl = false
    }
    if (!gl || !dish.depthImage) {
      setState("fallback")
      return
    }
    let live = true
    import("../three/viewer")
      .then(async (m) => {
        if (!live || !stageRef.current) return
        const v = new m.DishViewer(stageRef.current, reduced)
        viewer.current = v
        await v.load({ image: mediaUrl(dish.image), depth: mediaUrl(dish.depthImage), effect: dish.effect, kind: dish.effect === "fizz" ? "glass" : "plate" })
        if (live) setState("ready")
      })
      .catch(() => live && setState("fallback"))
    return () => {
      live = false
      viewer.current?.dispose()
      viewer.current = null
    }
  }, [dish])

  // focus inside, Escape closes, Tab stays in the dialog, the page behind does not scroll
  React.useEffect(() => {
    const d = dialogRef.current
    d?.querySelector<HTMLElement>("[data-autofocus]")?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "Tab" && d) {
        const f = Array.from(d.querySelectorAll<HTMLElement>("button,[href],input,[tabindex]:not([tabindex='-1'])")).filter((x) => !x.hasAttribute("disabled"))
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="viewer-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className="viewer" role="dialog" aria-modal="true" aria-labelledby="viewer-h" aria-describedby="viewer-d">
        <div className="viewer-head">
          <h2 id="viewer-h">
            {dish.name} <span style={{ color: "var(--chrome-muted)", fontSize: 20 }}>· {money(dish.priceCents)}</span>
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the 3D view" data-autofocus>
            ×
          </button>
        </div>
        <div
          ref={stageRef}
          className="viewer-stage"
          tabIndex={0}
          aria-label={"3D view of " + dish.name + ". Drag, or use the left and right arrow keys, to turn it."}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") (e.preventDefault(), viewer.current?.rotateBy(-0.3))
            if (e.key === "ArrowRight") (e.preventDefault(), viewer.current?.rotateBy(0.3))
          }}
        >
          {state === "loading" && <p className="viewer-fallback">Setting the table…</p>}
          {state === "fallback" && (
            <div className="viewer-fallback">
              <img src={mediaUrl(dish.image)} alt={dish.alt || dish.name} />
              <p>The 3D view needs WebGL, which this browser has turned off. Here is the dish as printed.</p>
            </div>
          )}
        </div>
        <p id="viewer-d" className="sr-only">
          {dish.description}
        </p>
        <div className="viewer-tools">
          <button type="button" className="btn small" onClick={() => viewer.current?.rotateBy(-Math.PI / 4)} disabled={state !== "ready"}>
            ⟲ Turn left
          </button>
          <button type="button" className="btn small" onClick={() => viewer.current?.reset()} disabled={state !== "ready"}>
            Reset
          </button>
          <button type="button" className="btn small" onClick={() => viewer.current?.rotateBy(Math.PI / 4)} disabled={state !== "ready"}>
            Turn right ⟳
          </button>
        </div>
      </div>
    </div>
  )
}
