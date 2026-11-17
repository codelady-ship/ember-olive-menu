/**
 * The rise on the page. One WebGL renderer for the whole book: when a featured
 * spread arrives, its canvas is moved over that page's printed photo, the dish
 * is built from the photo + height map, and gsap plays the rise:
 *
 *   plate lifts and tilts toward the reader, its shadow spreads  (0 → 0.9 s)
 *   the food gains height, lit from the lamp                      (0.45 → 1.75 s)
 *   steam drifts up (hot dishes) or bubbles, beads and a glint (drinks)
 *
 * It holds while the page is open, follows the pointer a little, and lowers
 * back flat into the paper before the page turns. At rest the canvas matches
 * the printed photo exactly, so the hand-over is invisible.
 */
import * as THREE from "three"
import { gsap } from "gsap"
import { createDish, type DishObject, type DishSpec, type DishState } from "./dish"

const FOV = 26

export class RiseEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 50)
  private dish: DishObject | null = null
  private key = ""
  private host: HTMLElement | null = null
  private box: HTMLElement | null = null
  private ro: ResizeObserver
  private raf = 0
  private t0 = performance.now()
  private tl: gsap.core.Timeline | null = null
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  private loading: Promise<void> | null = null
  private spec: DishSpec | null = null
  private pxScale = 400
  state: DishState = { lift: 0, height: 0, steam: 0, fizz: 0, glint: 0, stir: 0 }
  lost = false
  onChange: (risen: boolean) => void = () => {}

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power", premultipliedAlpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    const el = this.renderer.domElement
    el.className = "eo-rise-canvas"
    el.setAttribute("aria-hidden", "true")
    el.addEventListener("webglcontextlost", (e) => {
      e.preventDefault()
      this.lost = true
      this.onChange(false)
    })
    this.ro = new ResizeObserver(() => this.layout())
  }

  /** Put the canvas over `box` (the printed photo) inside `host` and build the dish. */
  attach(host: HTMLElement, box: HTMLElement, spec: DishSpec, key: string): Promise<void> {
    if (this.key === key && this.host === host) return this.loading || Promise.resolve()
    this.detach()
    this.key = key
    this.host = host
    this.box = box
    this.spec = spec
    host.appendChild(this.renderer.domElement)
    this.ro.observe(host)
    this.layout()
    this.loading = createDish(spec).then((d) => {
      if (this.key !== key) {
        d.dispose()
        return
      }
      this.dish = d
      this.scene.add(d.group)
      this.renderOnce()
    })
    return this.loading
  }

  detach() {
    this.tl?.kill()
    this.tl = null
    cancelAnimationFrame(this.raf)
    this.raf = 0
    if (this.dish) {
      this.scene.remove(this.dish.group)
      this.dish.dispose()
      this.dish = null
    }
    if (this.host) {
      this.ro.unobserve(this.host)
      this.host.classList.remove("eo-risen")
    }
    this.renderer.domElement.remove()
    this.host = null
    this.box = null
    this.key = ""
    this.loading = null
    Object.assign(this.state, { lift: 0, height: 0, steam: 0, fizz: 0, glint: 0, stir: 0 })
  }

  get attachedKey() {
    return this.key
  }

  setPointer(x: number, y: number) {
    this.pointer.tx = Math.max(-1, Math.min(1, x))
    this.pointer.ty = Math.max(-1, Math.min(1, y))
  }

  /** Measure the canvas and aim the camera so the dish plane lands exactly on the printed photo. */
  private layout() {
    const host = this.host
    const box = this.box
    if (!host || !box) return
    // offsetWidth / offsetTop ignore the 3D transforms of the turning leaf
    const W = host.offsetWidth
    const H = host.offsetHeight
    if (!W || !H) return
    this.renderer.setSize(W, H, false)
    const el = this.renderer.domElement
    el.style.width = W + "px"
    el.style.height = H + "px"
    const bw = box.offsetWidth
    // host and photo share an offset parent (the dish figure)
    const bx = box.offsetLeft - host.offsetLeft + bw / 2
    const by = box.offsetTop - host.offsetTop + box.offsetHeight / 2
    // world unit = the photo's width; the camera sees the whole host
    const worldH = H / bw
    const dist = worldH / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    this.camera.aspect = W / H
    this.camera.position.set(0, 0, dist)
    this.camera.near = dist * 0.2
    this.camera.far = dist * 3
    this.camera.updateProjectionMatrix()
    this.scene.position.set((bx - W / 2) / bw, -(by - H / 2) / bw, 0)
    this.pxScale = (H * this.renderer.getPixelRatio()) / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    this.renderOnce()
  }

  private apply() {
    const d = this.dish
    if (!d) return
    const s = this.state
    const p = this.pointer
    p.x += (p.tx - p.x) * 0.06
    p.y += (p.ty - p.y) * 0.06
    const glass = this.spec?.kind === "glass"
    // lift toward the reader and tilt the top away, so the height shows
    d.body.position.set(0, glass ? 0.04 * s.lift : 0, (glass ? 0.06 : 0.1) * s.lift)
    d.body.rotation.set((glass ? -0.12 : -0.42) * s.lift + p.y * 0.16 * s.lift, p.x * 0.22 * s.lift, (glass ? 0 : -0.04) * s.lift)
    d.shadow.position.x = (glass ? (d.bounds.x0 + d.bounds.x1) / 2 : 0) + 0.035 * s.lift
    d.shadow.position.y = (glass ? d.bounds.y0 + 0.01 : 0) - 0.05 * s.lift
    d.update((performance.now() - this.t0) / 1000, s, this.pxScale)
  }

  private renderOnce() {
    if (this.lost) return
    this.apply()
    this.renderer.render(this.scene, this.camera)
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    this.renderOnce()
  }
  private start() {
    if (!this.raf) this.raf = requestAnimationFrame(this.loop)
  }
  private stop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.renderOnce()
  }

  async rise() {
    if (this.lost) return
    await this.loading
    if (!this.dish || !this.host) return
    const s = this.state
    const fx = this.spec?.effect
    this.tl?.kill()
    this.host.classList.add("eo-risen")
    this.onChange(true)
    this.start()
    const tl = gsap.timeline()
    tl.to(s, { lift: 1, duration: 0.9, ease: "power2.out" }, 0)
    tl.to(s, { height: 1, duration: 1.3, ease: "power2.inOut" }, 0.45)
    if (fx === "steam") tl.to(s, { steam: 1, duration: 1.6, ease: "sine.inOut" }, 1.1)
    if (fx === "fizz") {
      tl.to(s, { fizz: 1, duration: 0.9, ease: "sine.out" }, 0.9)
      tl.fromTo(s, { stir: 1 }, { stir: 0.35, duration: 3.2, ease: "sine.out" }, 0.9)
      tl.fromTo(s, { glint: 0 }, { glint: 1, duration: 1.3, ease: "power1.inOut" }, 1.6)
    }
    this.tl = tl
  }

  /** Lower back flat into the page; resolves once it is flat. */
  lower(fast = false): Promise<void> {
    if (!this.dish || (this.state.lift === 0 && this.state.height === 0)) return Promise.resolve()
    const s = this.state
    this.tl?.kill()
    const k = fast ? 0.45 : 1
    return new Promise((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          this.host?.classList.remove("eo-risen")
          this.onChange(false)
          this.stop()
          resolve()
        },
      })
      tl.to(s, { steam: 0, fizz: 0, duration: 0.3 * k, ease: "sine.in" }, 0)
      tl.to(s, { height: 0, duration: 0.55 * k, ease: "power2.inOut" }, 0)
      tl.to(s, { lift: 0, duration: 0.6 * k, ease: "power2.inOut" }, 0.1 * k)
      this.tl = tl
    })
  }

  /** Snap flat with no animation (a fast flick through the pages). */
  flat() {
    this.tl?.kill()
    Object.assign(this.state, { lift: 0, height: 0, steam: 0, fizz: 0, glint: 0, stir: 0 })
    this.host?.classList.remove("eo-risen")
    this.onChange(false)
    this.stop()
  }

  dispose() {
    this.detach()
    this.ro.disconnect()
    this.renderer.dispose()
  }
}

let engine: RiseEngine | null = null
export function getEngine(): RiseEngine {
  return (engine ??= new RiseEngine())
}
