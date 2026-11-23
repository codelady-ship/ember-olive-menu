/**
 * The Ember & Olive menu book.
 *
 * Page-turning mechanics adapted from "Biryani Legends Template" by Kedhareswer
 * Naidu (MIT, https://kedhar-components.pages.dev/#biryani-legends-template):
 * a closed book on the desk whose cover swings open in 3D, a sticky stage
 * scrubbed by the window's scroll (no pinning, scroll is never captured or
 * rewritten), real leaves turning on rotateY with shading and a cast shadow,
 * keys / tabs / swipe / arrows that only scroll the window, one page at a time
 * on phones, and calm fades for reduced motion.
 *
 * New here: the black leather cover with gold corners, brass binding and a
 * sheen over the embossed logo; spreads generated from the dishes API; and on
 * every featured spread the printed dish rises off the page in three.js (or a
 * CSS lift where 3D is not a good idea) and lowers back before the page turns.
 */
import * as React from "react"
import { gsap } from "gsap"
import "./book.css"
import { mediaUrl } from "../lib/api"
import { ALLERGEN_LABEL, BADGE_LABEL, money, type Dish, type Menu, type Section } from "../lib/menu"
import { SITE } from "../content/site"
import { paintTextures } from "./textures"
import { Arrow, Bubbles, Corner, Crest, Seal, Sprig, SteamSvg } from "./ornaments"
import type { RiseEngine } from "../three/rise"

type Page =
  | { kind: "contents" }
  | { kind: "title" }
  | { kind: "dish-text"; dish: Dish; n: number }
  | { kind: "dish-photo"; dish: Dish; n: number }
  | { kind: "section"; section: Section; dishes: Dish[]; cont: boolean }
  | { kind: "notes" }
  | { kind: "visit" }
  | { kind: "visit-r" }
  | { kind: "closing" }
  | { kind: "colophon" }

export type MenuBookProps = {
  menu: Menu
  onAdd: (dish: Dish) => void
  onView3D: (dish: Dish) => void
  onSubscribe: (email: string) => Promise<string | void>
  /** Which effect mode to use; "auto" decides from the device. */
  fx?: "auto" | "3d" | "css" | "none"
  /** Keep the cover closed (the menu is still loading). */
  hold?: boolean
}

const PER_PAGE = 5
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
const useIso = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

export function buildPages(menu: Menu): Page[] {
  const pages: Page[] = [{ kind: "contents" }, { kind: "title" }]
  menu.featured.forEach((dish, n) => pages.push({ kind: "dish-text", dish, n }, { kind: "dish-photo", dish, n }))
  const secPages: Page[] = []
  for (const section of menu.sections) {
    if (!section.dishes.length) continue
    for (let i = 0; i < section.dishes.length; i += PER_PAGE) secPages.push({ kind: "section", section, dishes: section.dishes.slice(i, i + PER_PAGE), cont: i > 0 })
  }
  if (secPages.length % 2) secPages.push({ kind: "notes" })
  pages.push(...secPages, { kind: "visit" }, { kind: "visit-r" }, { kind: "closing" }, { kind: "colophon" })
  return pages
}

/** A dish's kind for the 3D: a glass stands, a plate lies. */
const kindOf = (d: Dish) => (d.effect === "fizz" ? "glass" : "plate") as "glass" | "plate"

export default function MenuBook({ menu, onAdd, onView3D, onSubscribe, fx = "auto", hold = false }: MenuBookProps) {
  const pages = React.useMemo(() => buildPages(menu), [menu])
  const N = pages.length / 2 // spreads

  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)
  const stageRef = React.useRef<HTMLElement | null>(null)
  const bookRef = React.useRef<HTMLDivElement | null>(null)
  const leafRefs = React.useRef<(HTMLDivElement | null)[]>([])
  const coverRef = React.useRef<HTMLDivElement | null>(null)
  const baseRef = React.useRef<HTMLDivElement | null>(null)
  const figures = React.useRef(new Map<number, { host: HTMLDivElement | null; box: HTMLDivElement | null }>())
  /** Dish photo pages whose photo may load: the first one, and each one once the book comes near it. */
  const photoNear = React.useRef(new Set<number>())
  const engineRef = React.useRef<RiseEngine | null>(null)
  const enginePromise = React.useRef<Promise<RiseEngine | null> | null>(null)
  const s = React.useRef({ u: 0, target: 0, t: 0, c: 0, opened: false, idx: -1, seen: new Set<number>(), risen: -1, settleK: -1, settleAt: 0, visible: true, pend: { to: 0, at: -1e9 } })

  const [single, setSingle] = React.useState(false)
  const [size, setSize] = React.useState({ w: 0, h: 0, x: 0, y: 0 })
  const [reduced, setReduced] = React.useState(false)
  const [idx, setIdx] = React.useState(0)
  const [ready, setReady] = React.useState(false)
  const [load, setLoad] = React.useState(0)
  const [tex, setTex] = React.useState({ grain: "none", leather: "none", walnut: "none" })
  const [lifted, setLifted] = React.useState(-1)
  const [mode, setMode] = React.useState<"3d" | "css" | "none">("css")
  const [email, setEmail] = React.useState("")
  const [joined, setJoined] = React.useState("")
  const [err, setErr] = React.useState("")

  const turns = single ? N * 2 - 1 : N - 1
  const segVh = single ? 0.75 : 0.9
  /** leaf index (desktop: spread; phone: page) → spread */
  const spreadOf = (i: number) => (single ? Math.floor(i / 2) : i)
  /** spread → leaf index */
  const idxOfSpread = (sp: number) => (single ? sp * 2 : sp)
  /** The dish photo page showing when leaf index k is open, or -1. */
  const photoPageAt = React.useCallback(
    (k: number) => {
      const p = single ? k : k * 2 + 1
      return pages[p]?.kind === "dish-photo" ? p : -1
    },
    [pages, single],
  )

  // ---- media and device
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  React.useEffect(() => {
    if (fx !== "auto") return setMode(fx)
    if (reduced) return setMode("none")
    const nav = navigator as Navigator & { deviceMemory?: number }
    const lowEnd = (nav.hardwareConcurrency || 8) <= 2 || (nav.deviceMemory ?? 8) <= 2
    const coarse = window.matchMedia("(pointer: coarse)").matches
    let gl = false
    try {
      const c = document.createElement("canvas")
      gl = !!(c.getContext("webgl2") || c.getContext("webgl"))
    } catch {
      gl = false
    }
    setMode(!single && !coarse && !lowEnd && gl ? "3d" : "css")
  }, [fx, reduced, single])

  React.useEffect(() => setTex(paintTextures()), [])

  // ---- the closed book waits for the type, the sheen passes, then it opens
  React.useEffect(() => {
    let done = false
    const t0 = performance.now()
    setLoad(0.4)
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts
    Promise.race([fonts ? fonts.ready : Promise.resolve(), wait(2500)]).then(() => {
      if (done) return
      setLoad(1)
      window.setTimeout(() => !done && setReady(true), Math.max(400, 1900 - (performance.now() - t0)))
    })
    return () => {
      done = true
    }
  }, [])

  // ---- measure the stage, size the book
  useIso(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => {
      const W = stage.clientWidth
      const H = stage.clientHeight
      const one = W < 760 || W / H < 0.95
      const top = 56
      const bot = 56
      const availW = W - (one ? 24 : 64)
      const availH = H - top - bot - (one ? 12 : 28)
      let w: number
      let h: number
      if (one) {
        w = Math.max(260, Math.min(availW, availH * 0.72))
        h = Math.max(380, Math.min(availH, w / 0.5))
      } else {
        w = Math.max(320, Math.min(availW, availH * 1.42))
        h = w / 1.42
      }
      setSingle(one)
      setSize({ w, h, x: (W - w) / 2, y: top + (availH - h) / 2 + (one ? 6 : 14) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  // ---- 3D engine, loaded only when a featured spread is near
  const getEngine = React.useCallback(() => {
    if (mode !== "3d") return Promise.resolve(null)
    if (!enginePromise.current)
      enginePromise.current = import("../three/rise")
        .then((m) => {
          const e = m.getEngine()
          e.onChange = () => {}
          engineRef.current = e
          return e
        })
        .catch(() => null)
    return enginePromise.current
  }, [mode])

  const riseAt = React.useCallback(
    async (p: number) => {
      const st = s.current
      st.risen = p
      const page = pages[p]
      if (page?.kind !== "dish-photo") return
      // a dish with its own film plays that instead of the 3D (never under reduced motion)
      if (mode === "css" || (mode === "3d" && page.dish.video)) return setLifted(p)
      if (mode !== "3d") return
      const e = await getEngine()
      const f = figures.current.get(p)
      if (!e || e.lost || !f?.host || !f.box || st.risen !== p) {
        if (st.risen === p) setLifted(p)
        return
      }
      const d = page.dish
      try {
        await e.attach(f.host, f.box, { image: mediaUrl(d.image), depth: mediaUrl(d.depthImage), effect: d.effect, kind: kindOf(d) }, "p" + p)
        if (s.current.risen === p) await e.rise()
      } catch {
        if (st.risen === p) setLifted(p) // textures failed: fall back to the CSS lift
      }
    },
    [getEngine, mode, pages],
  )
  const lowerNow = React.useCallback((snap = false) => {
    const st = s.current
    if (st.risen < 0) return Promise.resolve()
    st.risen = -1
    setLifted(-1)
    const e = engineRef.current
    if (!e) return Promise.resolve()
    if (snap) {
      e.flat()
      return Promise.resolve()
    }
    return e.lower()
  }, [])

  // ---- apply a turn position to the leaves
  const apply = React.useCallback(() => {
    const st = s.current
    const raw = st.opened ? st.t : 0
    const t = reduced ? Math.round(raw) : raw
    const leaves = leafRefs.current
    for (let i = 0; i < leaves.length; i++) {
      const el = leaves[i]
      if (!el) continue
      const p = 0.5 - 0.5 * Math.cos(clamp(t - i, 0, 1) * Math.PI)
      const lift = Math.sin(p * Math.PI)
      el.style.transform = "rotateY(" + (-180 * p).toFixed(3) + "deg)"
      el.style.zIndex = String(p > 0 && p < 1 ? 900 : p >= 1 ? 100 + i : 600 - i)
      el.style.visibility = Math.abs(t - i - 0.5) < 2 ? "visible" : "hidden"
      el.style.setProperty("--lift", lift.toFixed(3))
      const shades = el.querySelectorAll(":scope > .eo-face > .eo-shade")
      if (shades[0]) (shades[0] as HTMLElement).style.opacity = (p * 0.9).toFixed(3)
      if (shades[1]) (shades[1] as HTMLElement).style.opacity = ((1 - p) * 0.9).toFixed(3)
    }
    if (baseRef.current) baseRef.current.style.visibility = t > leaves.length - 2.2 ? "visible" : "hidden"
    const cover = coverRef.current
    if (cover) {
      const c = st.c
      cover.style.transform = "rotateY(" + (-180 * c).toFixed(3) + "deg)"
      cover.style.zIndex = String(c > 0 && c < 1 ? 950 : c >= 1 ? 50 : 1000)
      cover.style.setProperty("--lift", Math.sin(c * Math.PI).toFixed(3))
      cover.style.visibility = single && c >= 1 ? "hidden" : t < 1.6 || !st.opened ? "visible" : "hidden"
    }
    const book = bookRef.current
    if (book) {
      book.style.transform = "translateX(" + (single ? 0 : -25 * (1 - st.c)).toFixed(3) + "%)"
      book.style.setProperty("--open", String(st.c))
    }
    stageRef.current?.style.setProperty("--prog", String(turns ? clamp(t / turns, 0, 1) : 0))
    const i = t >= st.idx ? Math.floor(t + 0.12) : Math.ceil(t - 0.12)
    if (i !== st.idx && st.opened && st.c > 0.55) {
      st.idx = i
      setIdx(i)
      introRef.current(i)
    }
  }, [reduced, single, turns])

  // ---- a page arrives: its type settles in once
  const introRef = React.useRef((_i: number) => {})
  introRef.current = (i: number) => {
    const root = rootRef.current
    if (!root) return
    const st = s.current
    const pgs = single ? [i] : [i * 2, i * 2 + 1]
    for (const p of pgs) {
      if (st.seen.has(p)) continue
      st.seen.add(p)
      const q = (sel: string) => Array.from(root.querySelectorAll('[data-pg="' + p + '"] ' + sel))
      if (reduced) {
        const el = q(".eo-in")
        if (el.length) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: "power1.out" })
        continue
      }
      const tl = gsap.timeline()
      const to = (t: Element[], v: gsap.TweenVars, at: number) => t.length && tl.to(t, v, at)
      to(q(".eo-ch"), { yPercent: 0, opacity: 1, filter: "blur(0px)", duration: 1.1, ease: "power2.out", stagger: 0.035 }, 0.15)
      to(q(".eo-fade"), { opacity: 1, y: 0, duration: 1.1, ease: "sine.out", stagger: 0.09 }, 0.35)
    }
  }

  // ---- hide what has not arrived yet
  useIso(() => {
    const root = rootRef.current
    if (!root || !size.w || reduced) return
    const st = s.current
    const ctx = gsap.context(() => {
      for (let p = 0; p < pages.length; p++) {
        if (st.seen.has(p)) continue
        const q = (sel: string) => Array.from(root.querySelectorAll('[data-pg="' + p + '"] ' + sel))
        const ch = q(".eo-ch")
        const fade = q(".eo-fade")
        if (ch.length) gsap.set(ch, { yPercent: 60, opacity: 0, filter: "blur(5px)" })
        if (fade.length) gsap.set(fade, { opacity: 0, y: 10 })
      }
    }, root)
    return () => ctx.kill()
  }, [size.w > 0, single, pages, reduced])

  // ---- scroll drives the turns; nothing is pinned and the window scrolls freely
  const progress = React.useCallback(() => {
    const sc = scrollerRef.current
    const stage = stageRef.current
    if (!sc || !stage) return 0
    const total = sc.offsetHeight - stage.offsetHeight
    if (total <= 0) return 0
    return clamp(-sc.getBoundingClientRect().top / total, 0, 1) * turns
  }, [turns])
  /** Each turn has a still landing at both ends, so a page can rest open without snapping. */
  const targetOf = React.useCallback(
    (u: number) => {
      if (reduced) return Math.round(u)
      const i = Math.floor(u)
      if (i >= turns) return turns
      const f = clamp((u - i - 0.2) / 0.6, 0, 1)
      return i + f
    },
    [reduced, turns],
  )

  React.useEffect(() => {
    if (!size.w) return
    const st = s.current
    let raf = 0
    const onScroll = () => {
      st.u = progress()
      st.target = targetOf(st.u)
    }
    onScroll()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!st.visible) return
      const d = st.target - st.t
      st.t = Math.abs(d) < 0.0006 || reduced ? st.target : st.t + d * 0.14
      apply()
      // rise / lower
      if (!st.opened || st.c < 1) return
      const k = Math.round(st.u)
      const resting = Math.abs(st.u - k) <= 0.1 && Math.abs(st.t - k) < 0.002
      const photo = photoPageAt(k)
      if (st.risen >= 0) {
        if (!resting || photo !== st.risen) lowerNow(Math.abs(st.t - Math.round(st.t)) > 0.002)
      } else if (resting && photo >= 0) {
        if (st.settleK !== k) {
          st.settleK = k
          st.settleAt = performance.now()
        } else if (performance.now() - st.settleAt > 320) {
          st.settleK = -1
          riseAt(photo)
        }
      } else st.settleK = -1
      // warm up three.js when a featured spread is one turn away, but not before the reader starts turning:
      // on the opening spread it used to load with the page even when nobody turned a page
      if (mode === "3d" && !enginePromise.current && st.u > 0.04 && (photoPageAt(k) >= 0 || photoPageAt(k + 1) >= 0)) getEngine()
    }
    const io = new IntersectionObserver(([en]) => (st.visible = en.isIntersecting))
    if (stageRef.current) io.observe(stageRef.current)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [size.w > 0, apply, progress, targetOf, photoPageAt, riseAt, lowerNow, getEngine, mode, reduced])

  // ---- the cover opens
  React.useEffect(() => {
    const st = s.current
    if (!ready || hold || st.opened) return
    st.opened = true
    if (reduced) {
      st.c = 1
      apply()
      return
    }
    const tw = gsap.to(st, { c: 1, duration: 2.2, ease: "power3.inOut", delay: 0.2, onUpdate: apply })
    return () => {
      // unmounted mid-swing (or React re-running the effect): start over next time
      tw.kill()
      st.opened = false
      st.c = 0
    }
  }, [ready, hold])

  // a layout change (phone ↔ desktop) moves every page; start the 3D afresh
  React.useEffect(() => {
    lowerNow(true)
    engineRef.current?.detach()
  }, [single, lowerNow])
  React.useEffect(() => () => engineRef.current?.detach(), [])

  // ---- go to a leaf: lower the dish first, then scroll the window there
  const goTo = React.useCallback(
    async (i: number) => {
      const sc = scrollerRef.current
      const stage = stageRef.current
      if (!sc || !stage || !turns) return
      const target = clamp(i, 0, turns)
      const st = s.current
      st.pend = { to: target, at: performance.now() }
      if (st.risen >= 0) {
        const lowering = lowerNow()
        await Promise.race([lowering, wait(650)])
      }
      const top = sc.getBoundingClientRect().top + window.scrollY
      const total = sc.offsetHeight - stage.offsetHeight
      window.scrollTo({ top: Math.round(top + (total * target) / turns), behavior: reduced ? "auto" : "smooth" })
    },
    [turns, reduced, lowerNow],
  )

  // ---- keys, swipe, pointer
  React.useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const st = s.current
    const inView = () => {
      const r = stage.getBoundingClientRect()
      return r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.5
    }
    // a turn asked for but not reached yet counts as done, so quick presses add up
    const cur = () => (performance.now() - st.pend.at < 2200 && Math.abs(st.u - st.pend.to) > 0.05 ? st.pend.to : Math.round(st.u))
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !inView()) return
      const t = e.target as HTMLElement | null
      if (t && (/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(t.tagName) && e.key === " ")) return
      if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return
      if (document.querySelector("[aria-modal='true']")) return
      let next = -1
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) next = cur() + 1
      else if (e.key === "ArrowLeft" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) next = cur() - 1
      else if (e.key === "Home") next = 0
      else if (e.key === "End") next = turns
      else return
      if (next < 0 || next > turns) return
      e.preventDefault()
      goTo(next)
    }
    let sx = 0
    let sy = 0
    const onStart = (e: TouchEvent) => {
      sx = e.touches[0].clientX
      sy = e.touches[0].clientY
    }
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx
      const dy = e.changedTouches[0].clientY - sy
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.3) return
      goTo(Math.round(st.u) + (dx < 0 ? 1 : -1))
    }
    let raf = 0
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = stage.getBoundingClientRect()
        const x = ((e.clientX - r.left) / r.width) * 2 - 1
        const y = ((e.clientY - r.top) / r.height) * 2 - 1
        stage.style.setProperty("--px", x.toFixed(3))
        stage.style.setProperty("--py", y.toFixed(3))
        engineRef.current?.setPointer(x, y)
      })
    }
    window.addEventListener("keydown", onKey)
    stage.addEventListener("touchstart", onStart, { passive: true })
    stage.addEventListener("touchend", onEnd, { passive: true })
    if (!reduced) stage.addEventListener("pointermove", onMove)
    return () => {
      window.removeEventListener("keydown", onKey)
      stage.removeEventListener("touchstart", onStart)
      stage.removeEventListener("touchend", onEnd)
      stage.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(raf)
    }
  }, [goTo, turns, reduced])

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("That address looks unfinished.")
    setErr("")
    try {
      const note = await onSubscribe(email)
      setJoined(note || "Sealed. You’ll hear when the menu changes.")
    } catch (x) {
      setErr((x as Error).message || "That did not go through. Please try again.")
    }
  }

  // ---- pages ------------------------------------------------------------------
  const sectionSpread = pages.findIndex((p) => p.kind === "section") >> 1
  const visitSpread = pages.findIndex((p) => p.kind === "visit") >> 1
  const closingSpread = pages.findIndex((p) => p.kind === "closing") >> 1
  const folioOf = (p: number) => p + 1
  const letters = (text: string) =>
    text.split(" ").map((w, wi) => (
      <span key={wi} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
        {w.split("").map((ch, i) => (
          <span key={i} className="eo-ch" aria-hidden="true">
            {ch}
          </span>
        ))}
        {" "}
      </span>
    ))

  const renderPage = (p: number): React.ReactNode => {
    const page = pages[p]
    const side = p % 2
    const foot = (label: string) => (
      <>
        <span className="eo-folio-n" style={side === 0 ? { left: "5%" } : { right: "5%" }}>
          {folioOf(p)}
        </span>
        <span className="eo-run" style={side === 0 ? { left: "13%" } : { right: "13%" }}>
          {label}
        </span>
      </>
    )
    switch (page.kind) {
      case "contents":
        return (
          <div className="eo-in">
            <p className="eo-kicker eo-fade">Contents</p>
            <h2 className="eo-display" style={{ fontSize: "calc(var(--u) * 3.2)", margin: ".3em 0 .7em" }} aria-label="Tonight’s book">
              {letters("Tonight’s book")}
            </h2>
            <ol className="eo-toc">
              {menu.featured.map((d, i) => (
                <li key={d.slug} className="eo-fade">
                  <button type="button" onClick={() => goTo(idxOfSpread(1 + i))}>
                    <span className="n">{ROMAN[i] || i + 1}</span>
                    <span className="t">
                      {d.name}
                      <small>{d.description.split(",")[0].split(" with ")[0]}</small>
                    </span>
                    <span className="d" />
                    <span className="p">{folioOf((1 + i) * 2)}</span>
                  </button>
                </li>
              ))}
              {[
                { label: "The menu", sub: menu.sections.map((x) => x.title).slice(0, 3).join(", ") + "…", sp: sectionSpread },
                { label: "Visit & book", sub: "Hours, the table, the address", sp: visitSpread },
                { label: "The last page", sub: "Letters from the kitchen", sp: closingSpread },
              ].map((x) => (
                <li key={x.label} className="eo-fade">
                  <button type="button" onClick={() => goTo(idxOfSpread(x.sp))}>
                    <span className="n">&middot;</span>
                    <span className="t">
                      {x.label}
                      <small>{x.sub}</small>
                    </span>
                    <span className="d" />
                    <span className="p">{folioOf(x.sp * 2)}</span>
                  </button>
                </li>
              ))}
            </ol>
            {foot("Contents")}
          </div>
        )
      case "title":
        return (
          <div className="eo-in eo-title-page">
            <Crest />
            <p className="eo-kicker eo-fade" style={{ marginTop: "1.4em" }}>
              Wood fire &middot; Olive oil &middot; London
            </p>
            {/* The page's single h1 is in Site.tsx; the title page is decorative type. */}
            <p className="eo-display" style={{ fontSize: "calc(var(--u) * 5)", margin: ".35em 0 .1em", color: "var(--ember)" }} aria-label={SITE.name} translate="no">
              {letters(SITE.name)}
            </p>
            <span className="eo-script eo-fade" style={{ margin: 0 }}>
              a menu you can turn
            </span>
            <Sprig />
            <p className="eo-copy eo-fade" style={{ maxWidth: "26em", marginTop: "1em" }}>
              Turn the page and the dish rises to meet you. Everything here is cooked over olive wood and charcoal, finished with oil from one grove.
            </p>
            {foot(SITE.name)}
          </div>
        )
      case "dish-text": {
        const d = page.dish
        const section = menu.sections.find((x) => x.slug === d.section)
        return (
          <div className="eo-in">
            <p className="eo-kicker eo-fade">
              {ROMAN[page.n]} &middot; {section?.title || d.section}
            </p>
            <h2 className="eo-name" aria-label={d.name}>
              {letters(d.name)}
            </h2>
            {section?.subtitle && <span className="eo-script eo-fade">{section.subtitle.toLowerCase()}</span>}
            <p className="eo-lede eo-fade">{d.description}</p>
            {d.story && <p className="eo-copy eo-fade" style={{ margin: "0 0 1em" }}>{d.story}</p>}
            <div className="eo-price-row eo-fade">
              <span className="eo-kicker">Price</span>
              <span className="eo-rule-dots" />
              <span className="eo-price">{money(d.priceCents)}</span>
            </div>
            {(d.badges.length > 0 || !d.available) && (
              <ul className="eo-badges eo-fade" aria-label="Notes">
                {!d.available && <li className="eo-badge out">Sold out today</li>}
                {d.badges.map((b) => (
                  <li key={b} className={"eo-badge" + (b === "signature" || b === "chef-pick" || b === "new" ? " ember" : "")}>
                    {BADGE_LABEL[b] || b}
                  </li>
                ))}
              </ul>
            )}
            <p className="eo-allergens eo-fade">
              <b>Allergens:</b> {d.allergens.length ? d.allergens.map((a) => ALLERGEN_LABEL[a] || a).join(", ") : "none of the 14 major allergens"}
            </p>
            <div className="eo-actions eo-fade">
              <button type="button" className="eo-stamp solid" onClick={() => onAdd(d)} disabled={!d.available}>
                Add to order
              </button>
              <a className="eo-stamp" href="#reserve">
                Book a table
              </a>
            </div>
            {foot(section?.title || "")}
          </div>
        )
      }
      case "dish-photo": {
        const d = page.dish
        const glass = kindOf(d) === "glass"
        // Only the first dish photo loads with the page; the others (about 150 KB each) start loading when the
        // book is one spread (phones: two pages) away, so they are ready before their page opens.
        if (page.n === 0 || Math.abs((single ? p : p >> 1) - idx) <= (single ? 2 : 1)) photoNear.current.add(p)
        const src = photoNear.current.has(p) ? mediaUrl(d.image) : undefined
        return (
          <div className="eo-in eo-dish-page">
            <div className={"eo-figure" + (glass ? " glass" : "") + (lifted === p ? " lifted" : "")} data-slug={d.slug}>
              <div className="eo-printed" />
              <div
                className="eo-photo"
                ref={(el) => {
                  const f = figures.current.get(p) || { host: null, box: null }
                  f.box = el
                  figures.current.set(p, f)
                }}
              >
                <img src={src} alt={d.alt || d.name} width={1024} height={1024} loading={page.n === 0 ? "eager" : "lazy"} fetchPriority={page.n === 0 ? "high" : "auto"} decoding="async" draggable={false} onLoad={(e) => e.currentTarget.classList.add("on")} />
                {d.video && lifted === p && mode !== "none" && (
                  <video className="eo-clip" src={mediaUrl(d.video)} poster={mediaUrl(d.image)} muted loop playsInline autoPlay aria-hidden="true" onError={(e) => e.currentTarget.remove()} />
                )}
              </div>
              {lifted === p && d.effect === "steam" && <SteamSvg />}
              {lifted === p && d.effect === "fizz" && <Bubbles />}
              <div
                className="eo-rise-host"
                ref={(el) => {
                  const f = figures.current.get(p) || { host: null, box: null }
                  f.host = el
                  figures.current.set(p, f)
                }}
              />
            </div>
            <p className="eo-caption eo-fade">
              {d.name} &middot; {money(d.priceCents)}
            </p>
            <div className="eo-view3d eo-fade">
              <button type="button" className="eo-stamp" onClick={() => onView3D(d)} aria-haspopup="dialog">
                View in 3D
              </button>
            </div>
            {foot("Plate " + ROMAN[page.n])}
          </div>
        )
      }
      case "section":
        return (
          <div className="eo-in">
            <p className="eo-kicker eo-fade">The menu</p>
            <h2 className="eo-sec-title eo-fade">
              {page.section.title}
              {page.cont ? " (continued)" : ""}
            </h2>
            {!page.cont && page.section.subtitle && <p className="eo-sec-sub eo-fade">{page.section.subtitle}</p>}
            <ul className="eo-items">
              {page.dishes.map((d) => (
                <li key={d.slug} className="eo-fade">
                  <div className="eo-item-head">
                    <span className="eo-item-name">{d.name}</span>
                    <span className="eo-rule-dots" />
                    <span className="eo-item-price">{money(d.priceCents)}</span>
                  </div>
                  <p className="eo-item-desc">
                    {d.description} {!d.available && <span className="eo-soldout">Sold out today.</span>}
                  </p>
                  {(d.badges.length > 0 || d.allergens.length > 0) && (
                    <p className="eo-item-meta">
                      {[...d.badges.map((b) => BADGE_LABEL[b] || b), d.allergens.length ? "Contains " + d.allergens.map((a) => (ALLERGEN_LABEL[a] || a).toLowerCase()).join(", ") : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {foot(page.section.title)}
          </div>
        )
      case "notes":
        return (
          <div className="eo-in eo-title-page">
            <Sprig />
            <p className="eo-lede eo-fade" style={{ maxWidth: "20em" }}>
              “Good oil, a patient fire and nothing in a hurry.”
            </p>
            <p className="eo-small eo-fade">Allergens are listed under every dish. Ask us about anything else.</p>
            {foot("Notes")}
          </div>
        )
      case "visit":
        return (
          <div className="eo-in">
            <p className="eo-kicker eo-fade">Visit</p>
            <h2 className="eo-display eo-fade" style={{ fontSize: "calc(var(--u) * 3.2)", margin: ".3em 0 .6em", color: "var(--ember)" }}>
              A table by the fire
            </h2>
            <ul className="eo-hours eo-fade">
              {SITE.hoursText.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <p className="eo-copy eo-fade">
              {SITE.address.street}, {SITE.address.locality} {SITE.address.postalCode}
              <br />
              <a href={"tel:" + SITE.phone.replace(/\s/g, "")} style={{ color: "inherit" }}>
                {SITE.phone}
              </a>
            </p>
            <div className="eo-actions eo-fade">
              <a className="eo-stamp solid" href="#reserve">
                Reserve a table
              </a>
              <a className="eo-stamp" href="#order">
                Order takeaway
              </a>
            </div>
            {foot("Visit")}
          </div>
        )
      case "visit-r":
        return (
          <div className="eo-in eo-title-page">
            <Crest />
            <p className="eo-lede eo-fade" style={{ maxWidth: "22em" }}>
              Seatings every half hour, lunch and dinner. Parties of up to ten can book here; for more, call and we’ll set the long table.
            </p>
            <p className="eo-small eo-fade">Walk-ins welcome at the bar.</p>
            {foot("The table")}
          </div>
        )
      case "closing":
        return (
          <div className="eo-in">
            <p className="eo-kicker eo-fade">The last page</p>
            <h2 className="eo-display" style={{ fontSize: "calc(var(--u) * 3.1)", margin: ".3em 0 .2em" }} aria-label="Until the next menu">
              {letters("Until the next menu")}
            </h2>
            <span className="eo-script eo-fade">we write when it changes</span>
            <p className="eo-copy eo-fade" style={{ margin: "1.2em 0" }}>
              Seasonal dishes, the first truffles, a new fizz. One letter when the book changes, never more.
            </p>
            <div className="eo-fade">
              {joined ? (
                <p className="eo-thanks" role="status">
                  {joined}
                </p>
              ) : (
                <form className="eo-form" onSubmit={subscribe} noValidate>
                  <label className="eo-sr" htmlFor="eo-email">
                    Email address
                  </label>
                  <input id="eo-email" className="eo-input" type="email" inputMode="email" autoComplete="email" placeholder="your@address.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={err ? true : undefined} aria-describedby={err ? "eo-email-err" : undefined} />
                  <button type="submit" className="eo-seal" aria-label="Seal and send">
                    <Seal letters="E&O" />
                  </button>
                </form>
              )}
              {err && (
                <p id="eo-email-err" className="eo-small" role="alert" style={{ color: "#8a1f14", marginTop: ".5em" }}>
                  {err}
                </p>
              )}
            </div>
            {foot("Letters")}
          </div>
        )
      case "colophon":
        return (
          <div className="eo-in">
            <p className="eo-kicker eo-fade">Colophon</p>
            <Sprig />
            <p className="eo-copy eo-fade" style={{ margin: "1em 0" }}>
              <span translate="no">{SITE.name}</span> &middot; {SITE.address.street}, {SITE.address.locality}
            </p>
            <p className="eo-small eo-fade">Set in Cormorant Garamond, Crimson Pro and Allura. Dish photographs from Wikimedia Commons; see the credits.</p>
            <p className="eo-small eo-fade">
              Page-turning after the Biryani Legends Template by Kedhareswer Naidu (MIT).
            </p>
            <p className="eo-small eo-fade">{SITE.demoNote}</p>
            <p className="eo-fade" style={{ marginTop: "auto" }}>
              <button type="button" className="eo-linkbtn" onClick={() => goTo(0)}>
                Back to the contents
              </button>
            </p>
            {foot("Colophon")}
          </div>
        )
    }
  }

  const visiblePages = new Set(single ? [idx] : [idx * 2, idx * 2 + 1])
  const face = (p: number, key: string, back = false) => (
    <div className={"eo-face eo-page" + (back ? " eo-back" : "")} key={key} data-pg={p} inert={!visiblePages.has(p) || undefined}>
      {renderPage(p)}
      <div className="eo-fx eo-grain" />
      <div className="eo-fx eo-age" />
      <div className={"eo-fx " + (p % 2 ? "eo-gutter-r" : "eo-gutter-l")} />
      <div className="eo-fx eo-light" />
      <div className="eo-fx eo-dimmer" />
      <div className="eo-fx eo-shade" />
    </div>
  )
  const coverFace = (
    <div className="eo-face eo-cover" inert={ready || undefined}>
      <div className="eo-fx eo-leather" />
      <div className="eo-fx eo-cover-spine" />
      <div className="eo-brass">
        <i style={{ top: "12%" }} />
        <i style={{ top: "50%" }} />
        <i style={{ top: "86%" }} />
      </div>
      <div className="eo-emboss" />
      <Corner style={{ right: "2.5%", top: "2.5%", transform: "scaleX(-1)" }} />
      <Corner style={{ right: "2.5%", bottom: "2.5%", transform: "scale(-1,-1)" }} />
      <Corner style={{ left: "6%", top: "2.5%" }} />
      <Corner style={{ left: "6%", bottom: "2.5%", transform: "scaleY(-1)" }} />
      <div className="eo-cover-c">
        <Crest className="eo-crest" />
        <p className="eo-logo" translate="no" style={{ marginTop: "calc(var(--u) * 1.6)" }}>
          Ember
          <span className="amp">&amp;</span>
          Olive
          {!reduced && <span className="eo-sheen" aria-hidden="true" />}
        </p>
        <span className="eo-cover-sub">Est. MMXXVI &middot; London</span>
      </div>
      <div className="eo-load" style={{ "--load": load, opacity: ready && !hold ? 0 : 1 } as React.CSSProperties} aria-hidden="true">
        {ready && !hold ? "Opening the menu" : "Lighting the grill"}
        <i />
      </div>
    </div>
  )

  // desktop: leaf i = right page of spread i (front) + left page of spread i+1 (back)
  // phone: one leaf per page, front only
  const leaves: { front: React.ReactNode; back: React.ReactNode }[] = []
  if (single) for (let p = 0; p < N * 2 - 1; p++) leaves.push({ front: face(p, "f" + p), back: null })
  else for (let i = 0; i < N - 1; i++) leaves.push({ front: face(i * 2 + 1, "f" + i), back: face(i * 2 + 2, "b" + i, true) })
  leafRefs.current.length = leaves.length

  const u = single ? ((size.w * 2) / 100) * 1.3 : size.w / 100
  const curSpread = spreadOf(idx)
  const tabs = [
    { label: "Contents", sp: 0 },
    { label: "Signatures", sp: menu.featured.length ? 1 : 0 },
    { label: "Menu", sp: sectionSpread },
    { label: "Visit", sp: visitSpread },
  ]
  const tabOf = (sp: number) => tabs.reduce((best, t, i) => (sp >= t.sp ? i : best), 0)
  const pageLabel = single ? "p. " + (idx + 1) + " of " + pages.length : "pp. " + (idx * 2 + 1) + "–" + (idx * 2 + 2) + " of " + pages.length

  const vars = {
    "--u": u + "px",
    "--grain": tex.grain,
    "--leather-tex": tex.leather,
    "--walnut": tex.walnut,
  } as React.CSSProperties

  return (
    <div ref={rootRef} className={"eo-book-root" + (single ? " eo-single" : "")} style={vars}>
      <div ref={scrollerRef} className="eo-scroller" style={{ height: "calc(100svh * " + (1 + turns * segVh).toFixed(2) + ")" }}>
        <section ref={stageRef} className="eo-stage" aria-roledescription="menu book" aria-label={SITE.name + " menu book"}>
          <header className="eo-bar eo-top">
            <a className="eo-mark" href="#top" aria-label={SITE.name + ", back to the top"}>
              <b translate="no">{SITE.name}</b>
              <i>the menu</i>
            </a>
            <nav aria-label="Menu book chapters">
              <ul className="eo-tabs">
                {tabs.map((t, i) => (
                  <li key={t.label}>
                    <button type="button" className="eo-tab" aria-current={tabOf(curSpread) === i ? "true" : undefined} onClick={() => goTo(idxOfSpread(t.sp))}>
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <a className="eo-skip" href="#menu">
              Skip the book
            </a>
            <a className="eo-cta" href="#reserve">
              Book a table
            </a>
          </header>
          <div className="eo-3d">
            <div ref={bookRef} className="eo-book" style={{ left: size.x, top: size.y, width: size.w, height: size.h, visibility: size.w ? "visible" : "hidden" }}>
              <div className="eo-boards" />
              <div className="eo-under eo-under-l" />
              <div className="eo-under eo-under-r" />
              <div ref={baseRef} className="eo-leaf" style={{ zIndex: 1 }}>
                {face(pages.length - 1, "base")}
              </div>
              {leaves.map((l, i) => (
                <div key={(single ? "s" : "d") + i} ref={(el) => void (leafRefs.current[i] = el)} className="eo-leaf">
                  {l.front}
                  {l.back}
                </div>
              ))}
              <div ref={coverRef} className="eo-leaf" style={{ zIndex: 1000 }}>
                {coverFace}
                {!single && face(0, "cover-back", true)}
              </div>
            </div>
          </div>
          <footer className="eo-bar eo-bottom">
            <span className="eo-hint">Scroll, swipe or use &larr; &rarr; to turn the page</span>
            <span className="eo-folio" aria-live="polite">
              {pageLabel}
            </span>
            <div className="eo-nav">
              <button type="button" className="eo-btn" aria-label="Previous page" disabled={idx <= 0} onClick={() => goTo(idx - 1)}>
                <Arrow dir={-1} />
              </button>
              <button type="button" className="eo-btn" aria-label="Next page" disabled={idx >= turns} onClick={() => goTo(idx + 1)}>
                <Arrow dir={1} />
              </button>
            </div>
          </footer>
          <div className="eo-progress" />
        </section>
      </div>
    </div>
  )
}
