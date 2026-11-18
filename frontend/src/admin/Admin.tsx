import * as React from "react"
import { API, ApiError, hasApi, mediaUrl, post, request } from "../lib/api"
import { ALLERGEN_LABEL, BADGE_LABEL, money } from "../lib/menu"
import { SANDBOX_TOKEN, resetSandbox, sandboxRequest } from "./sandbox"

const KEY = "eo-admin-token"
const ROLE_KEY = "eo-admin-role"
/** Public by design: the server seeds it as a read-only "demo" admin (backend/src/seed/seed.ts). */
const DEMO_ADMIN = { email: "demo@ember-olive.demo", password: "demo1234" }
type Role = "admin" | "demo" | "sandbox"

/** Admin calls: the in-browser sandbox for the sandbox token, the API otherwise. A 403 also shows a toast. */
async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  try {
    if (init.token === SANDBOX_TOKEN) return await sandboxRequest<T>(path, init)
    return await request<T>(path, init)
  } catch (x) {
    if (x instanceof ApiError && x.status === 403) toast(x.message)
    throw x
  }
}

function toast(message: string) {
  window.dispatchEvent(new CustomEvent("eo-toast", { detail: message }))
}

function Toast() {
  const [msg, setMsg] = React.useState("")
  React.useEffect(() => {
    let t = 0
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail)
      window.clearTimeout(t)
      t = window.setTimeout(() => setMsg(""), 4000)
    }
    window.addEventListener("eo-toast", on)
    return () => {
      window.removeEventListener("eo-toast", on)
      window.clearTimeout(t)
    }
  }, [])
  return (
    <div className="admin-toast" role="status" aria-live="polite" hidden={!msg}>
      {msg}
    </div>
  )
}

function store(key: string, value: string) {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    /* private mode: the session still works for this tab */
  }
}

/** true when the API answers its health check within 8 s; false sends the demo to the sandbox. */
function useApiUp() {
  const [up, setUp] = React.useState<boolean | null>(hasApi() ? null : false)
  React.useEffect(() => {
    if (!hasApi()) return
    const ctrl = new AbortController()
    const t = window.setTimeout(() => ctrl.abort(), 8000)
    fetch(API + "/api/health", { signal: ctrl.signal })
      .then((r) => setUp(r.ok))
      .catch(() => setUp(false))
      .finally(() => window.clearTimeout(t))
    return () => ctrl.abort()
  }, [])
  return up
}
const ALLERGENS = Object.keys(ALLERGEN_LABEL)
const BADGES = Object.keys(BADGE_LABEL)

type AdminDish = {
  _id?: string
  slug: string
  name: string
  section: string
  description: string
  story: string
  priceCents: number
  allergens: string[]
  badges: string[]
  available: boolean
  featured: boolean
  featuredOrder: number
  order: number
  effect: "steam" | "fizz" | "none"
  image: string
  depthImage: string
  video: string
  alt: string
}
type SectionRow = { _id: string; slug: string; title: string }
type Res = { _id: string; code: string; name: string; email: string; phone: string; date: string; time: string; partySize: number; notes: string; status: string }
type OrderRow = { _id: string; code: string; name: string; phone: string; pickupAt: string; items: { name: string; qty: number }[]; totalCents: number; status: string; notes: string; createdAt: string }
type Msg = { _id: string; name: string; email: string; subject: string; message: string; read: boolean; createdAt: string }

const blank = (): AdminDish => ({ slug: "", name: "", section: "", description: "", story: "", priceCents: 0, allergens: [], badges: [], available: true, featured: false, featuredOrder: 0, order: 0, effect: "none", image: "", depthImage: "", video: "", alt: "" })

function readToken(key = KEY) {
  try {
    return sessionStorage.getItem(key) || ""
  } catch {
    return ""
  }
}

export default function Admin() {
  const [token, setToken] = React.useState(() => readToken())
  const [role, setRole] = React.useState<Role>(() => (readToken() === SANDBOX_TOKEN ? "sandbox" : readToken(ROLE_KEY) === "demo" ? "demo" : "admin"))
  const apiUp = useApiUp()
  const [reset, setReset] = React.useState(0)
  const [tab, setTab] = React.useState<"dishes" | "reservations" | "orders" | "messages" | "subscribers">("dishes")

  React.useEffect(() => {
    const m = document.createElement("meta")
    m.name = "robots"
    m.content = "noindex,nofollow"
    document.head.appendChild(m)
    document.title = "Staff · Ember & Olive"
    return () => m.remove()
  }, [])

  const signOut = React.useCallback(() => {
    store(KEY, "")
    store(ROLE_KEY, "")
    setToken("")
  }, [])
  const signIn = (t: string, r: Role) => {
    store(KEY, t)
    store(ROLE_KEY, r)
    setRole(r)
    setToken(t)
  }

  if (!token)
    return (
      <>
        <Login onSignIn={signIn} apiUp={apiUp} />
        <Toast />
      </>
    )

  const tabs = ["dishes", "reservations", "orders", "messages", "subscribers"] as const
  return (
    <div className="admin">
      <div className="wrap">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>
            <span translate="no">Ember &amp; Olive</span> · staff
          </h1>
          <div className="row">
            <a className="btn small" href="#top">
              View site
            </a>
            <button className="btn small" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
        {role !== "admin" && (
          <div className="note demo-note" role="note">
            <p>
              <strong>Demo mode.</strong>{" "}
              {role === "demo" ? "Read-only demo admin: every page opens, changes are not saved." : "Changes are not saved: they stay in this browser tab until you reset or close it."}
            </p>
            {role === "sandbox" && (
              <button
                className="btn small"
                type="button"
                onClick={() => {
                  if (!window.confirm("Reset the demo data in this tab?")) return
                  resetSandbox()
                  setReset((n) => n + 1)
                  toast("Demo data reset.")
                }}
              >
                Reset demo data
              </button>
            )}
          </div>
        )}
        <div className="tabs" role="tablist" aria-label="Sections">
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" id={"tab-" + t} aria-controls={"panel-" + t} aria-selected={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={"panel-" + tab} aria-labelledby={"tab-" + tab} key={reset}>
          {tab === "dishes" && <Dishes token={token} onAuth={signOut} />}
          {tab === "reservations" && <Reservations token={token} onAuth={signOut} />}
          {tab === "orders" && <Orders token={token} onAuth={signOut} />}
          {tab === "messages" && <Messages token={token} onAuth={signOut} />}
          {tab === "subscribers" && <Subscribers token={token} onAuth={signOut} />}
        </div>
      </div>
      <Toast />
    </div>
  )
}

function Login({ onSignIn, apiUp }: { onSignIn: (token: string, role: Role) => void; apiUp: boolean | null }) {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [err, setErr] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr("")
    try {
      const r = await post<{ token: string; role?: string }>("/api/auth/login", { email, password })
      onSignIn(r.token, r.role === "demo" ? "demo" : "admin")
    } catch (x) {
      setErr((x as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const demo = async () => {
    setErr("")
    if (!apiUp) return onSignIn(SANDBOX_TOKEN, "sandbox")
    setBusy(true)
    try {
      const r = await post<{ token: string }>("/api/auth/login", DEMO_ADMIN)
      onSignIn(r.token, "demo")
    } catch {
      onSignIn(SANDBOX_TOKEN, "sandbox") // demo account missing or the API fell asleep: use the in-browser copy
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="admin">
      <div className="wrap" style={{ maxWidth: 440 }}>
        <h1>Staff sign-in</h1>
        <div className="note demo-note">
          <p>Just looking around? Open the panel as a demo admin. No real data can be changed.</p>
          <button className="btn solid" type="button" onClick={demo} disabled={busy || apiUp === null}>
            {apiUp === null ? "Checking the server…" : "Demo admin"}
          </button>
          <p className="demo-hint">
            {apiUp ? (
              <>
                Or sign in below with <strong>{DEMO_ADMIN.email}</strong> / <strong>{DEMO_ADMIN.password}</strong> (read-only).
              </>
            ) : (
              "The server is not reachable, so the demo runs in this browser tab with sample data."
            )}
          </p>
        </div>
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="a-email">Email</label>
            <input id="a-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="a-pass">Password</label>
            <input id="a-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && (
            <p className="note bad" role="alert">
              {err}
            </p>
          )}
          <button className="btn solid" type="submit" disabled={busy || !apiUp}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}

/** Load with the token; a 401 signs out. */
function useAdmin<T>(path: string, token: string, onAuth: () => void) {
  const [data, setData] = React.useState<T | null>(null)
  const [err, setErr] = React.useState("")
  const load = React.useCallback(async () => {
    try {
      setData(await call<T>(path, { token }))
      setErr("")
    } catch (x) {
      if ((x as ApiError).status === 401) onAuth()
      else setErr((x as Error).message)
    }
  }, [path, token, onAuth])
  React.useEffect(() => {
    load()
  }, [load])
  return { data, err, reload: load, setErr }
}

function Dishes({ token, onAuth }: { token: string; onAuth: () => void }) {
  const { data, err, reload, setErr } = useAdmin<AdminDish[]>("/api/admin/dishes", token, onAuth)
  const sections = useAdmin<SectionRow[]>("/api/admin/sections", token, onAuth)
  const [edit, setEdit] = React.useState<AdminDish | null>(null)
  const [saved, setSaved] = React.useState("")

  const save = async (d: AdminDish) => {
    setSaved("")
    try {
      const { _id, ...body } = d
      if (_id) await call("/api/admin/dishes/" + _id, { method: "PATCH", body: JSON.stringify(body), token })
      else await call("/api/admin/dishes", { method: "POST", body: JSON.stringify(body), token })
      setSaved("Saved " + d.name + ".")
      setEdit(null)
      reload()
    } catch (x) {
      const e = x as ApiError
      setErr(e.message + (e.details.length ? " " + e.details.map((f) => f.field + ": " + f.message).join("; ") : ""))
    }
  }
  const remove = async (d: AdminDish) => {
    if (!d._id || !window.confirm("Delete " + d.name + "? This cannot be undone.")) return
    try {
      await call("/api/admin/dishes/" + d._id, { method: "DELETE", token })
      reload()
    } catch (x) {
      setErr((x as Error).message)
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ margin: 0, color: "var(--chrome-muted)" }}>Featured dishes become spreads in the book, in “book order”.</p>
        <button className="btn small" type="button" onClick={() => setEdit(blank())}>
          New dish
        </button>
      </div>
      {err && (
        <p className="note bad" role="alert">
          {err}
        </p>
      )}
      {saved && (
        <p className="note ok" role="status">
          {saved}
        </p>
      )}
      {edit && <DishForm dish={edit} sections={sections.data || []} token={token} onSave={save} onCancel={() => setEdit(null)} />}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Photo</th>
              <th scope="col">Dish</th>
              <th scope="col">Section</th>
              <th scope="col">Price</th>
              <th scope="col">Book order</th>
              <th scope="col">On today</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((d) => (
              <tr key={d._id}>
                <td>{d.image ? <img className="thumb" src={mediaUrl(d.image)} alt="" loading="lazy" /> : "—"}</td>
                <td>{d.name}</td>
                <td>{d.section}</td>
                <td>{money(d.priceCents)}</td>
                <td>{d.featured ? d.featuredOrder : "—"}</td>
                <td>{d.available ? "Yes" : "Sold out"}</td>
                <td>
                  <div className="row">
                    <button className="btn small" type="button" onClick={() => setEdit({ ...blank(), ...d })}>
                      Edit
                    </button>
                    <button className="btn small" type="button" onClick={() => remove(d)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function DishForm({ dish, sections, token, onSave, onCancel }: { dish: AdminDish; sections: SectionRow[]; token: string; onSave: (d: AdminDish) => void; onCancel: () => void }) {
  const [d, setD] = React.useState<AdminDish>(dish)
  const [price, setPrice] = React.useState((dish.priceCents / 100).toFixed(2))
  const [upErr, setUpErr] = React.useState("")
  const up = <K extends keyof AdminDish>(k: K, v: AdminDish[K]) => setD((x) => ({ ...x, [k]: v }))
  const toggle = (k: "allergens" | "badges", v: string) => up(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v])

  const upload = async (field: "image" | "depthImage", file: File | undefined) => {
    setUpErr("")
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setUpErr("Use a JPEG, PNG or WebP image.")
    if (file.size > 3 * 1024 * 1024) return setUpErr("Images must be 3 MB or smaller.")
    const fd = new FormData()
    fd.append("image", file)
    try {
      const r = await call<{ url: string }>("/api/admin/uploads", { method: "POST", body: fd, token })
      up(field, r.url)
    } catch (x) {
      setUpErr((x as Error).message)
    }
  }

  return (
    <form
      className="form note"
      style={{ marginBottom: 24 }}
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ ...d, priceCents: Math.round(Number(price) * 100) })
      }}
    >
      <h2 style={{ margin: 0, fontFamily: "var(--f-display)" }}>{dish._id ? "Edit " + dish.name : "New dish"}</h2>
      <div className="row">
        <div className="field">
          <label htmlFor="d-name">Name</label>
          <input id="d-name" className="input" value={d.name} onChange={(e) => up("name", e.target.value)} required maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="d-slug">Slug (in URLs and file names)</label>
          <input id="d-slug" className="input" value={d.slug} onChange={(e) => up("slug", e.target.value.toLowerCase())} required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="d-section">Section</label>
          <select id="d-section" className="input" value={d.section} onChange={(e) => up("section", e.target.value)} required>
            <option value="">Choose…</option>
            {sections.map((s) => (
              <option key={s._id} value={s.slug}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="d-price">Price (£)</label>
          <input id="d-price" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} pattern="\d+(\.\d{1,2})?" required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="d-desc">Description</label>
        <textarea id="d-desc" className="input" value={d.description} onChange={(e) => up("description", e.target.value)} maxLength={400} />
      </div>
      <div className="field">
        <label htmlFor="d-story">Story (shown on the book page)</label>
        <textarea id="d-story" className="input" value={d.story} onChange={(e) => up("story", e.target.value)} maxLength={1200} />
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="legend">Allergens</legend>
        <div className="checks">
          {ALLERGENS.map((a) => (
            <label key={a}>
              <input type="checkbox" checked={d.allergens.includes(a)} onChange={() => toggle("allergens", a)} /> {ALLERGEN_LABEL[a]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="legend">Badges</legend>
        <div className="checks">
          {BADGES.map((b) => (
            <label key={b}>
              <input type="checkbox" checked={d.badges.includes(b)} onChange={() => toggle("badges", b)} /> {BADGE_LABEL[b]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="checks">
        <label>
          <input type="checkbox" checked={d.available} onChange={(e) => up("available", e.target.checked)} /> Available today
        </label>
        <label>
          <input type="checkbox" checked={d.featured} onChange={(e) => up("featured", e.target.checked)} /> Featured (own spread in the book)
        </label>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="d-forder">Book order</label>
          <input id="d-forder" className="input" type="number" min={0} max={1000} value={d.featuredOrder} onChange={(e) => up("featuredOrder", Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="d-order">Order within section</label>
          <input id="d-order" className="input" type="number" min={0} max={1000} value={d.order} onChange={(e) => up("order", Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="d-effect">3D effect</label>
          <select id="d-effect" className="input" value={d.effect} onChange={(e) => up("effect", e.target.value as AdminDish["effect"])}>
            <option value="steam">Steam (hot dish)</option>
            <option value="fizz">Fizz (drink in a glass)</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="d-image">Cut-out photo (transparent, top-down)</label>
          <input id="d-image" className="input" value={d.image} onChange={(e) => up("image", e.target.value)} placeholder="menu/slug.webp or upload" />
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload the cut-out photo" onChange={(e) => upload("image", e.target.files?.[0])} />
        </div>
        <div className="field">
          <label htmlFor="d-depth">Height map (white = high)</label>
          <input id="d-depth" className="input" value={d.depthImage} onChange={(e) => up("depthImage", e.target.value)} placeholder="menu/slug-depth.webp or upload" />
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload the height map" onChange={(e) => upload("depthImage", e.target.files?.[0])} />
        </div>
      </div>
      {upErr && (
        <p className="err" role="alert">
          {upErr}
        </p>
      )}
      <div className="field">
        <label htmlFor="d-alt">Photo description for screen readers</label>
        <input id="d-alt" className="input" value={d.alt} onChange={(e) => up("alt", e.target.value)} maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor="d-video">Rise clip (optional, menu/slug.mp4)</label>
        <input id="d-video" className="input" value={d.video} onChange={(e) => up("video", e.target.value)} />
      </div>
      <div className="row">
        <button className="btn solid" type="submit">
          Save
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="note" style={{ fontSize: 14 }}>
        Uploads go to {API}/uploads. On a free host the disk is wiped on redeploy: keep originals, or point images at permanent https URLs.
      </p>
    </form>
  )
}

function Reservations({ token, onAuth }: { token: string; onAuth: () => void }) {
  const [date, setDate] = React.useState("")
  const { data, err, reload, setErr } = useAdmin<{ items: Res[]; total: number }>("/api/admin/reservations?limit=200" + (date ? "&date=" + date : ""), token, onAuth)
  const setStatus = async (r: Res, status: string) => {
    try {
      await call("/api/admin/reservations/" + r._id, { method: "PATCH", body: JSON.stringify({ status }), token })
      reload()
    } catch (x) {
      setErr((x as Error).message)
      reload()
    }
  }
  return (
    <>
      <div className="field" style={{ maxWidth: 260, marginBottom: 16 }}>
        <label htmlFor="res-date">Date</label>
        <input id="res-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {err && (
        <p className="note bad" role="alert">
          {err}
        </p>
      )}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Guests</th>
              <th scope="col">Name</th>
              <th scope="col">Contact</th>
              <th scope="col">Notes</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((r) => (
              <tr key={r._id}>
                <td>
                  {r.date} {r.time}
                  <br />
                  <small>{r.code}</small>
                </td>
                <td>{r.partySize}</td>
                <td>{r.name}</td>
                <td>
                  {r.email}
                  <br />
                  {r.phone}
                </td>
                <td>{r.notes}</td>
                <td>
                  <select className="input" value={r.status} onChange={(e) => setStatus(r, e.target.value)} aria-label={"Status of " + r.code}>
                    {["confirmed", "seated", "no-show", "cancelled"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: "var(--chrome-muted)" }}>{data?.total ?? 0} bookings</p>
    </>
  )
}

function Orders({ token, onAuth }: { token: string; onAuth: () => void }) {
  const { data, err, reload, setErr } = useAdmin<{ items: OrderRow[]; total: number }>("/api/admin/orders?limit=100", token, onAuth)
  const setStatus = async (o: OrderRow, status: string) => {
    try {
      await call("/api/admin/orders/" + o._id, { method: "PATCH", body: JSON.stringify({ status }), token })
      reload()
    } catch (x) {
      setErr((x as Error).message)
    }
  }
  return (
    <>
      {err && (
        <p className="note bad" role="alert">
          {err}
        </p>
      )}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Collect</th>
              <th scope="col">Customer</th>
              <th scope="col">Dishes</th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((o) => (
              <tr key={o._id}>
                <td>
                  {o.pickupAt}
                  <br />
                  <small>{o.code}</small>
                </td>
                <td>
                  {o.name}
                  <br />
                  {o.phone}
                </td>
                <td>
                  {o.items.map((i) => i.qty + " × " + i.name).join(", ")}
                  {o.notes && <p style={{ margin: "4px 0 0", fontStyle: "italic" }}>{o.notes}</p>}
                </td>
                <td>{money(o.totalCents)}</td>
                <td>
                  <select className="input" value={o.status} onChange={(e) => setStatus(o, e.target.value)} aria-label={"Status of " + o.code}>
                    {["new", "preparing", "ready", "collected", "cancelled"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Messages({ token, onAuth }: { token: string; onAuth: () => void }) {
  const { data, err, reload, setErr } = useAdmin<{ items: Msg[] }>("/api/admin/messages?limit=100", token, onAuth)
  const act = async (m: Msg, how: "read" | "delete") => {
    try {
      if (how === "delete") {
        if (!window.confirm("Delete this message?")) return
        await call("/api/admin/messages/" + m._id, { method: "DELETE", token })
      } else await call("/api/admin/messages/" + m._id, { method: "PATCH", body: JSON.stringify({ read: !m.read }), token })
      reload()
    } catch (x) {
      setErr((x as Error).message)
    }
  }
  return (
    <>
      {err && (
        <p className="note bad" role="alert">
          {err}
        </p>
      )}
      {(data?.items || []).map((m) => (
        <article key={m._id} className="note" style={{ marginBottom: 12, opacity: m.read ? 0.7 : 1 }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--f-display)" }}>{m.subject || "(no subject)"}</h3>
          <p style={{ margin: "0 0 8px", color: "var(--chrome-muted)" }}>
            {m.name} · <a href={"mailto:" + m.email}>{m.email}</a> · {new Date(m.createdAt).toLocaleString("en-GB")}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{m.message}</p>
          <div className="row">
            <button className="btn small" type="button" onClick={() => act(m, "read")}>
              {m.read ? "Mark unread" : "Mark read"}
            </button>
            <button className="btn small" type="button" onClick={() => act(m, "delete")}>
              Delete
            </button>
          </div>
        </article>
      ))}
      {data && !data.items.length && <p className="note">No messages.</p>}
    </>
  )
}

function Subscribers({ token, onAuth }: { token: string; onAuth: () => void }) {
  const { data, err } = useAdmin<{ email: string; createdAt: string }[]>("/api/admin/subscribers", token, onAuth)
  return (
    <>
      {err && (
        <p className="note bad" role="alert">
          {err}
        </p>
      )}
      <p>{data?.length ?? 0} people on the list.</p>
      <ul>
        {(data || []).map((s) => (
          <li key={s.email}>{s.email}</li>
        ))}
      </ul>
    </>
  )
}
