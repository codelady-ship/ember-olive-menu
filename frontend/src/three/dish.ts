/**
 * A dish made of light: the top-down cut-out photo on a finely divided plane,
 * pushed up by its height map (displacement) and shaded by the normals of that
 * map, so the food gains real volume. Optional steam (hot dishes) or fizz
 * (drinks: bubbles, condensation shimmer, one glint, a slow ice stir).
 *
 * Shared by the page (RiseEngine) and the "View in 3D" modal (DishViewer).
 */
import * as THREE from "three"

export type DishKind = "plate" | "glass"
export type DishSpec = { image: string; depth: string; effect: "steam" | "fizz" | "none"; kind: DishKind }

/** Animated state, all 0..1, driven by gsap from outside. */
export type DishState = { lift: number; height: number; steam: number; fizz: number; glint: number; stir: number }

const VERT = /* glsl */ `
uniform sampler2D uDepth;
uniform float uHeight;
varying vec2 vUv;
void main() {
  vUv = uv;
  float h = texture2D(uDepth, uv).r;
  vec3 p = position;
  p.z += h * uHeight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uDepth;
uniform float uHeight;
uniform float uTexel;
uniform float uTime;
uniform float uFizz;
uniform float uGlint;
uniform float uStir;
uniform vec3 uLight;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  vec4 c0 = texture2D(uMap, uv);
  // liquid = red-dominant texels; the ice drifts in it a little
  float liquid = clamp((c0.r - max(c0.g, c0.b)) * 2.5, 0.0, 1.0) * c0.a;
  if (uFizz > 0.0) {
    uv.x += uStir * 0.0035 * sin(uTime * 1.6 + uv.y * 42.0) * liquid;
    uv.y += uStir * 0.0025 * cos(uTime * 1.2 + uv.x * 37.0) * liquid;
  }
  vec4 c = texture2D(uMap, uv);
  if (c.a < 0.02) discard;

  // normal from the height map: flat when uHeight is 0, so the risen dish
  // starts out pixel-identical to the printed photo
  float hx = texture2D(uDepth, uv + vec2(uTexel, 0.0)).r - texture2D(uDepth, uv - vec2(uTexel, 0.0)).r;
  float hy = texture2D(uDepth, uv + vec2(0.0, uTexel)).r - texture2D(uDepth, uv - vec2(0.0, uTexel)).r;
  float k = uHeight * 7.0;
  vec3 n = normalize(vec3(-hx * k, -hy * k, 1.0));
  vec3 L = normalize(uLight);
  float shade = 1.0 + (dot(n, L) - L.z) * 0.95;
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 40.0) * 0.22 * min(1.0, uHeight * 6.0);
  vec3 col = c.rgb * shade + spec;

  if (uFizz > 0.0) {
    float lum = dot(c.rgb, vec3(0.3, 0.59, 0.11));
    float glass = (1.0 - liquid) * smoothstep(0.35, 0.8, lum) * c.a;
    // condensation: tiny beads that catch the light and let it go
    vec2 cell = floor(uv * 230.0);
    float bead = step(0.988, hash(cell + floor(uTime * 2.5 + hash(cell) * 7.0)));
    col += bead * glass * 0.55 * uFizz;
    // one glint sweeping across the rim and bowl
    float band = exp(-pow((uv.x * 0.85 - uv.y * 0.55 - uGlint) * 22.0, 2.0));
    col += band * (glass + liquid * 0.25) * 0.8 * uFizz;
  }
  gl_FragColor = vec4(col, c.a);
}
`

const STEAM_VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uHeight;
varying float vAlpha;
varying float vSeed;
void main() {
  float t = fract(uTime * (0.07 + aSeed * 0.05) + aSeed);
  vec3 p = aOrigin;
  p.z += uHeight * 0.9 + t * 0.4;
  p.y += t * 0.26;
  p.x += sin(uTime * 0.6 + aSeed * 40.0) * 0.05 * t + sin(t * 6.0 + aSeed * 9.0) * 0.03;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * (0.05 + t * 0.17) / -mv.z;
  vAlpha = sin(3.14159 * t) * (1.0 - t * 0.4);
  vSeed = aSeed;
}
`
const STEAM_FRAG = /* glsl */ `
uniform float uAmount;
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q);
  float wisp = 0.75 + 0.25 * sin(atan(q.y, q.x) * 3.0 + vSeed * 30.0);
  // soft round puff (never reaches the square edge of the sprite)
  float a = smoothstep(0.48, 0.0, r / wisp) * smoothstep(0.5, 0.4, r) * vAlpha * uAmount * 0.085;
  gl_FragColor = vec4(1.0, 0.985, 0.96, a);
}
`

const BUBBLE_VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uHeight;
varying float vAlpha;
void main() {
  float t = fract(uTime * (0.18 + aSeed * 0.22) + aSeed);
  vec3 p = aOrigin;
  p.y += t * aOrigin.z;   // aOrigin.z carries how far this bubble may rise
  p.z = uHeight * 0.85 + 0.004;
  p.x += sin(t * 9.0 + aSeed * 20.0) * 0.004;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * (0.006 + aSeed * 0.008) / -mv.z;
  vAlpha = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.8, 1.0, t));
}
`
const BUBBLE_FRAG = /* glsl */ `
uniform float uAmount;
varying float vAlpha;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q);
  float ring = smoothstep(0.5, 0.35, r) * (0.45 + 0.55 * smoothstep(0.15, 0.4, r));
  float hi = smoothstep(0.18, 0.0, length(q + vec2(0.15, 0.15)));
  gl_FragColor = vec4(1.0, 0.97, 0.95, (ring * 0.7 + hi) * vAlpha * uAmount);
}
`

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = "async"
  img.crossOrigin = "anonymous"
  img.src = src
  await img.decode()
  return img
}

/** Read a small copy of an image so particles can start in the right places. */
function sample(img: HTMLImageElement, n: number): Uint8ClampedArray {
  const c = document.createElement("canvas")
  c.width = c.height = n
  const ctx = c.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, n, n)
  return ctx.getImageData(0, 0, n, n).data
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A soft round shadow texture. */
function blobTexture(): THREE.Texture {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const ctx = c.getContext("2d")!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, "rgba(28,14,4,0.85)")
  g.addColorStop(0.55, "rgba(28,14,4,0.45)")
  g.addColorStop(1, "rgba(28,14,4,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

export type DishObject = {
  group: THREE.Group
  /** Everything that lifts (the dish and its particles); the shadow stays down. */
  body: THREE.Group
  shadow: THREE.Mesh
  /** Bounds of the opaque part, in plane units (-0.5..0.5). */
  bounds: { x0: number; x1: number; y0: number; y1: number }
  update: (time: number, s: DishState, pxScale: number) => void
  dispose: () => void
}

export const MAX_HEIGHT = { plate: 0.16, glass: 0.14 }

export async function createDish(spec: DishSpec, segments = 160): Promise<DishObject> {
  const [img, dimg] = await Promise.all([loadImage(spec.image), loadImage(spec.depth)])
  const map = new THREE.Texture(img)
  map.colorSpace = THREE.NoColorSpace
  map.anisotropy = 4
  map.needsUpdate = true
  const depth = new THREE.Texture(dimg)
  depth.colorSpace = THREE.NoColorSpace
  depth.needsUpdate = true

  const N = 64
  const px = sample(img, N)
  const dp = sample(dimg, N)
  // bounds of the visible pixels, for the drink's shadow and bubbles
  let x0 = N
  let x1 = 0
  let y0 = N
  let y1 = 0
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (px[(y * N + x) * 4 + 3] > 60) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  // plane units: x -0.5..0.5 left to right, y +0.5 at the top
  const bounds = { x0: x0 / N - 0.5, x1: (x1 + 1) / N - 0.5, y0: 0.5 - (y1 + 1) / N, y1: 0.5 - y0 / N }

  const uniforms = {
    uMap: { value: map },
    uDepth: { value: depth },
    uHeight: { value: 0 },
    uTexel: { value: 1.5 / dimg.naturalWidth },
    uTime: { value: 0 },
    uFizz: { value: 0 },
    uGlint: { value: -2 },
    uStir: { value: 0 },
    uLight: { value: new THREE.Vector3(-0.45, 0.55, 0.7) },
  }
  const geo = new THREE.PlaneGeometry(1, 1, segments, segments)
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geo, mat)

  const group = new THREE.Group()
  const body = new THREE.Group()
  body.add(mesh)

  // shadow: under a plate it is the plate's own disc; under a glass, a pool at its foot
  const blob = blobTexture()
  const shadowMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: 0 })
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat)
  if (spec.kind === "glass") {
    const w = (bounds.x1 - bounds.x0) * 1.1
    shadow.scale.set(w, w * 0.28, 1)
    shadow.position.set((bounds.x0 + bounds.x1) / 2, bounds.y0 + 0.01, -0.001)
  } else {
    shadow.scale.set(1.0, 1.0, 1)
    shadow.position.set(0, 0, -0.001)
  }
  shadow.renderOrder = -1
  group.add(shadow, body)

  const disposables: { dispose: () => void }[] = [geo, mat, map, depth, blob, shadowMat, shadow.geometry]
  const R = rng(spec.image.length * 7919)

  // ---- steam: soft wisps rising from the highest parts of the food
  let steamMat: THREE.ShaderMaterial | null = null
  if (spec.effect === "steam") {
    const hot: [number, number, number][] = []
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (dp[(y * N + x) * 4] > 150) hot.push([x / N - 0.5, 0.5 - y / N, dp[(y * N + x) * 4] / 255])
    const count = 64
    const origin = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const h = hot.length ? hot[Math.floor(R() * hot.length)] : [R() * 0.4 - 0.2, R() * 0.4 - 0.2, 0.5]
      origin.set([h[0], h[1], 0], i * 3)
      seed[i] = R()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute("aOrigin", new THREE.BufferAttribute(origin, 3))
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1))
    steamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uAmount: { value: 0 }, uHeight: { value: 0 } },
      vertexShader: STEAM_VERT,
      fragmentShader: STEAM_FRAG,
      transparent: true,
      depthWrite: false,
    })
    const pts = new THREE.Points(g, steamMat)
    pts.frustumCulled = false
    pts.renderOrder = 2
    body.add(pts)
    disposables.push(g, steamMat)
  }

  // ---- bubbles: tiny beads rising through the liquid
  let bubbleMat: THREE.ShaderMaterial | null = null
  if (spec.effect === "fizz") {
    const wet: [number, number][] = []
    const top = new Map<number, number>() // highest liquid row per column
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const o = (y * N + x) * 4
        if (px[o + 3] > 120 && px[o] - Math.max(px[o + 1], px[o + 2]) > 50) {
          wet.push([x, y])
          if (!top.has(x)) top.set(x, y)
        }
      }
    const count = 54
    const origin = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const w = wet.length ? wet[Math.floor(R() * wet.length)] : [N / 2, N / 2]
      const surface = top.get(w[0]) ?? w[1]
      origin.set([w[0] / N - 0.5 + (R() - 0.5) / N, 0.5 - w[1] / N, Math.max(0.01, (w[1] - surface) / N)], i * 3)
      seed[i] = R()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute("aOrigin", new THREE.BufferAttribute(origin, 3))
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1))
    bubbleMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uAmount: { value: 0 }, uHeight: { value: 0 } },
      vertexShader: BUBBLE_VERT,
      fragmentShader: BUBBLE_FRAG,
      transparent: true,
      depthWrite: false,
    })
    const pts = new THREE.Points(g, bubbleMat)
    pts.frustumCulled = false
    pts.renderOrder = 3
    body.add(pts)
    disposables.push(g, bubbleMat)
  }

  const maxH = MAX_HEIGHT[spec.kind]
  return {
    group,
    body,
    shadow,
    bounds,
    update(time, s, pxScale) {
      uniforms.uTime.value = time
      uniforms.uHeight.value = s.height * maxH
      uniforms.uFizz.value = spec.effect === "fizz" ? s.fizz : 0
      uniforms.uGlint.value = -0.8 + s.glint * 1.9
      uniforms.uStir.value = s.stir
      shadowMat.opacity = spec.kind === "glass" ? 0.15 + 0.4 * s.lift : 0.12 + 0.42 * s.lift
      const grow = 1 + 0.22 * s.lift
      if (spec.kind === "glass") {
        const w = (bounds.x1 - bounds.x0) * 1.1 * grow
        shadow.scale.set(w, w * 0.28, 1)
      } else shadow.scale.set(0.98 * grow, 0.98 * grow, 1)
      if (steamMat) {
        steamMat.uniforms.uTime.value = time
        steamMat.uniforms.uAmount.value = s.steam
        steamMat.uniforms.uScale.value = pxScale
        steamMat.uniforms.uHeight.value = s.height * maxH
      }
      if (bubbleMat) {
        bubbleMat.uniforms.uTime.value = time
        bubbleMat.uniforms.uAmount.value = s.fizz
        bubbleMat.uniforms.uScale.value = pxScale
        bubbleMat.uniforms.uHeight.value = s.height * maxH
      }
    },
    dispose() {
      for (const d of disposables) d.dispose()
    },
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}
