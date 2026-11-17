import * as React from "react"
import { ALLERGEN_LABEL, BADGE_LABEL, money, type Dish, type Menu } from "../lib/menu"
import DishPreview, { loadPreviewEngine } from "./DishPreview"

type Hover = { slug: string; row: HTMLElement; x: number | null; via: "pointer" | "focus" }

const CARD_GAP = 18
const EDGE = 12

/**
 * The whole menu as plain, accessible HTML (the same data as the book).
 *
 * Hover a dish (or focus it) and the book's rising dish floats beside it; on a
 * touch screen, tapping a dish name opens the same preview inside the list.
 */
export default function FullMenu({ menu, onAdd, demo }: { menu: Menu; onAdd: (d: Dish) => void; demo: boolean }) {
  const [hoverable, setHoverable] = React.useState(false)
  const [reduced, setReduced] = React.useState(false)
  const [hover, setHover] = React.useState<Hover | null>(null)
  const [open, setOpen] = React.useState("") // touch: the dish whose preview is open in the list
  const [shown, setShown] = React.useState<Dish | null>(null) // what the floating card shows (kept while it fades out)
  const [pos, setPos] = React.useState({ x: 0, y: 0 })
  const cardRef = React.useRef<HTMLDivElement | null>(null)
  const dismissed = React.useRef("")

  React.useEffect(() => {
    const hq = window.matchMedia("(hover: hover) and (pointer: fine)")
    const rq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => {
      setHoverable(hq.matches)
      setReduced(rq.matches)
    }
    on()
    hq.addEventListener("change", on)
    rq.addEventListener("change", on)
    return () => {
      hq.removeEventListener("change", on)
      rq.removeEventListener("change", on)
    }
  }, [])

  const bySlug = React.useMemo(() => new Map(menu.sections.flatMap((s) => s.dishes).map((d) => [d.slug, d])), [menu])
  const active = hoverable && hover ? bySlug.get(hover.slug) || null : null
  React.useEffect(() => {
    if (active) setShown(active)
  }, [active])

  // ---- place the floating card beside the cursor (or the row), inside the viewport
  const place = React.useCallback(() => {
    const card = cardRef.current
    if (!hover || !card) return
    const r = hover.row.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const w = card.offsetWidth
    const h = card.offsetHeight
    // beside the row when there is room (so the dish's own text stays readable), else beside the cursor
    let x: number
    if (r.right + CARD_GAP + w <= vw - EDGE) x = r.right + CARD_GAP
    else if (r.left - CARD_GAP - w >= EDGE) x = r.left - CARD_GAP - w
    else {
      const ax = hover.x ?? r.left + r.width / 2
      x = ax + CARD_GAP + w <= vw - EDGE ? ax + CARD_GAP : ax - CARD_GAP - w
    }
    x = Math.max(EDGE, Math.min(vw - EDGE - w, x))
    const y = Math.max(EDGE, Math.min(vh - EDGE - h, r.top + r.height / 2 - h / 2))
    setPos({ x: Math.round(x), y: Math.round(y) })
  }, [hover])
  React.useLayoutEffect(place, [place, shown])
  React.useEffect(() => {
    if (!hover) return
    const on = () => place()
    window.addEventListener("scroll", on, { passive: true })
    window.addEventListener("resize", on)
    return () => {
      window.removeEventListener("scroll", on)
      window.removeEventListener("resize", on)
    }
  }, [hover, place])

  // Escape dismisses the floating preview (it comes back on the next hover or focus)
  React.useEffect(() => {
    if (!hover && !open) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (hover) dismissed.current = hover.slug
      setHover(null)
      setOpen("")
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [hover, open])

  const enter = (d: Dish, row: HTMLElement, x: number | null, via: Hover["via"], force = false) => {
    if (!hoverable) return
    if (!force && dismissed.current === d.slug) return
    dismissed.current = ""
    // already showing this dish (a click after a hover, a tab within the row): keep it where it is
    setHover((h) => (h && h.slug === d.slug ? h : { slug: d.slug, row, x, via }))
  }
  const leave = (d: Dish, via: Hover["via"]) => {
    if (dismissed.current === d.slug && via === "focus") dismissed.current = ""
    setHover((h) => (h && h.slug === d.slug && h.via === via ? null : h))
  }

  return (
    <section id="menu" className="band" aria-labelledby="menu-h">
      <div className="wrap">
        <p className="kicker">The full menu</p>
        <h2 id="menu-h" className="h2">
          Everything on the <em>table</em>
        </h2>
        <p className="lead">
          The same dishes as the book, in one list. Allergens are listed under each dish; ask us about anything else.
          {demo && " You are looking at the sample menu that ships with the site."}
        </p>
        <div className="menu-cols" onPointerEnter={(e) => e.pointerType === "mouse" && !reduced && loadPreviewEngine()}>
          {menu.sections.map((s) => (
            <section key={s.slug} className="menu-sec" aria-labelledby={"sec-" + s.slug}>
              <h3 id={"sec-" + s.slug}>{s.title}</h3>
              {s.subtitle && <p>{s.subtitle}</p>}
              <ul className="menu-list">
                {s.dishes.map((d) => {
                  const floating = hoverable && hover?.slug === d.slug
                  const inline = !hoverable && open === d.slug
                  return (
                    <li
                      key={d.slug}
                      className={"menu-item" + (floating || inline ? " previewing" : "")}
                      data-slug={d.slug}
                      onPointerEnter={(e) => e.pointerType !== "touch" && enter(d, e.currentTarget, e.clientX, "pointer")}
                      onPointerMove={(e) => {
                        if (e.pointerType === "touch" || !hoverable) return
                        const x = e.clientX
                        const row = e.currentTarget
                        setHover((h) => (h && h.slug === d.slug && h.via === "pointer" && Math.abs((h.x ?? 0) - x) > 6 ? { ...h, x, row } : h))
                      }}
                      onPointerLeave={(e) => e.pointerType !== "touch" && leave(d, "pointer")}
                      onFocus={(e) => enter(d, e.currentTarget, null, "focus")}
                      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && leave(d, "focus")}
                    >
                      <h4>
                        <button
                          type="button"
                          className="dish-name"
                          aria-expanded={hoverable ? floating : inline}
                          aria-controls={hoverable ? undefined : "preview-" + d.slug}
                          onClick={(e) => {
                            // with a mouse the preview already follows hover and focus; a click brings it back after Escape
                            if (hoverable) enter(d, e.currentTarget.closest("li") as HTMLElement, null, "focus", true)
                            else setOpen((o) => (o === d.slug ? "" : d.slug))
                          }}
                        >
                          {d.name}
                        </button>
                      </h4>
                      <span className="price">{money(d.priceCents)}</span>
                      {inline && (
                        <div className="dp-inline">
                          <DishPreview dish={d} active reduced={reduced} id={"preview-" + d.slug} />
                        </div>
                      )}
                      <p>
                        {d.description} {!d.available && <span className="soldout">Sold out today.</span>}
                      </p>
                      {(d.badges.length > 0 || d.allergens.length > 0) && (
                        <p className="meta">
                          {[...d.badges.map((b) => BADGE_LABEL[b] || b), d.allergens.length ? "Allergens: " + d.allergens.map((a) => ALLERGEN_LABEL[a] || a).join(", ") : ""]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      <div className="row">
                        <button type="button" className="btn small" onClick={() => onAdd(d)} disabled={!d.available} aria-label={"Add " + d.name + " to your order"}>
                          Add to order
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
      {hoverable && shown && (
        <div ref={cardRef} className={"dp-float" + (active ? " on" : "")} style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }} aria-hidden="true">
          <DishPreview key={shown.slug} dish={shown} active={!!active} reduced={reduced} />
        </div>
      )}
    </section>
  )
}
