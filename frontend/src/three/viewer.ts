/**
 * "View in 3D": the dish set on a walnut table under a lamp. Drag (or use the
 * arrow keys) to walk all the way round it; the camera stays above the table.
 * A plate lies flat; a glass stands up, with its mirror image as its back.
 */
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { createDish, type DishObject, type DishSpec, type DishState } from "./dish"

function walnut(): THREE.Texture {
  const c = document.createElement("canvas")
  c.width = 512
  c.height = 512
  const ctx = c.getContext("2d")!
  const g = ctx.createLinearGradient(0, 0, 512, 0)
  g.addColorStop(0, "#3a2416")
  g.addColorStop(0.5, "#4a2e1b")
  g.addColorStop(1, "#33200f")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 512)
  let s = 7
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 160; i++) {
    const y = r() * 512
    ctx.strokeStyle = `rgba(${r() < 0.5 ? "20,10,4" : "110,70,40"},${0.08 + r() * 0.12})`
    ctx.lineWidth = 0.6 + r() * 2.2
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x / 60 + i) * 4 + (r() - 0.5) * 2)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 3)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class DishViewer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private baseFov = 35
  private camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50)
  private controls: OrbitControls
  private dishes: DishObject[] = []
  private raf = 0
  private t0 = performance.now()
  private ro: ResizeObserver
  private state: DishState = { lift: 1, height: 1, steam: 1, fizz: 1, glint: 0, stir: 0.35 }
  private table: THREE.Mesh

  constructor(
    private host: HTMLElement,
    private reduced: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0x120c08, 1)
    const el = this.renderer.domElement
    el.className = "eo-viewer-canvas"
    el.setAttribute("aria-hidden", "true")
    host.appendChild(el)

    const tex = walnut()
    // a pool of lamplight on the table
    const tableMat = new THREE.MeshBasicMaterial({ map: tex })
    tableMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\n float d = length(vWorldPos.xz); gl_FragColor.rgb *= mix(1.25, 0.25, smoothstep(0.3, 3.2, d));",
      )
      sh.fragmentShader = "varying vec3 vWorldPos;\n" + sh.fragmentShader
      sh.vertexShader = "varying vec3 vWorldPos;\n" + sh.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;")
    }
    this.table = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), tableMat)
    this.table.rotation.x = -Math.PI / 2
    this.scene.add(this.table)

    this.camera.position.set(0, 1.25, 1.35)
    this.controls = new OrbitControls(this.camera, el)
    this.controls.enableDamping = true
    this.controls.enablePan = false
    this.controls.minDistance = 0.9
    this.controls.maxDistance = 2.6
    this.controls.minPolarAngle = 0.12
    this.controls.maxPolarAngle = 1.32
    this.controls.target.set(0, 0.05, 0)
    this.controls.autoRotate = !reduced
    this.controls.autoRotateSpeed = 1.2
    el.addEventListener("pointerdown", () => (this.controls.autoRotate = false))
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
  }

  async load(spec: DishSpec) {
    const front = await createDish(spec, 200)
    if (spec.kind === "glass") {
      // stand the glass up; give it a back so it can be walked round
      const back = await createDish(spec, 200)
      for (const [d, ry] of [
        [front, 0],
        [back, Math.PI],
      ] as const) {
        d.group.rotation.y = ry
        // the foot of the glass rests on the table
        d.group.position.y = -d.bounds.y0
        d.shadow.visible = false
        this.scene.add(d.group)
        this.dishes.push(d)
      }
      this.controls.maxPolarAngle = 1.32
      this.controls.target.set(0, 0.45, 0)
      this.camera.position.set(0, 0.8, 1.6)
      // a shadow on the table under the glass
      const s = new THREE.Mesh(
        new THREE.CircleGeometry(0.2, 40),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
      )
      s.rotation.x = -Math.PI / 2
      s.position.y = 0.002
      this.scene.add(s)
    } else {
      // a photo has no sides: keep the camera high enough that the plate never shows its edge
      this.controls.maxPolarAngle = 0.95
      front.group.rotation.x = -Math.PI / 2
      front.group.position.y = 0.002
      this.scene.add(front.group)
      this.dishes.push(front)
    }
    this.loop()
  }

  rotateBy(rad: number) {
    this.controls.autoRotate = false
    const off = this.camera.position.clone().sub(this.controls.target)
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad)
    this.camera.position.copy(this.controls.target).add(off)
  }

  reset() {
    this.camera.position.set(0, this.dishes.length > 1 ? 0.8 : 1.25, this.dishes.length > 1 ? 1.6 : 1.35)
  }

  private resize() {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = w + "px"
    this.renderer.domElement.style.height = h + "px"
    this.camera.aspect = w / h
    // on a tall phone screen keep the side-to-side view as wide as on a square one
    const base = THREE.MathUtils.degToRad(this.baseFov)
    this.camera.fov = w >= h ? this.baseFov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(base / 2) / (w / h)))
    this.camera.updateProjectionMatrix()
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    const t = (performance.now() - this.t0) / 1000
    this.state.glint = this.reduced ? 0 : (t * 0.25) % 1.6
    const px = (this.renderer.domElement.height / 2) / Math.tan(THREE.MathUtils.degToRad(35 / 2))
    for (const d of this.dishes) d.update(this.reduced ? 0 : t, this.state, px)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.controls.dispose()
    for (const d of this.dishes) d.dispose()
    this.table.geometry.dispose()
    const m = this.table.material as THREE.MeshBasicMaterial
    m.map?.dispose()
    m.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
