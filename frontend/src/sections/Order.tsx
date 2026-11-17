import * as React from "react"
import { ApiError, hasApi, post, request } from "../lib/api"
import { money, type Dish } from "../lib/menu"
import type { Cart } from "../Site"

type Placed = { code: string; pickupAt: string; totalCents: number; items: { name: string; qty: number; lineCents: number }[] }

/** Collection times for the demo (the API sends its own list). */
function localPickupTimes() {
  const out: string[] = []
  const now = new Date()
  const min = now.getHours() * 60 + now.getMinutes() + 20
  for (const [a, b] of [
    [12 * 60, 14 * 60 + 30],
    [18 * 60, 21 * 60 + 45],
  ])
    for (let m = a; m <= b; m += 15) if (m >= min) out.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"))
  return out
}

export default function OrderSection({ dishes, cart, setCart }: { dishes: Dish[]; cart: Cart; setCart: React.Dispatch<React.SetStateAction<Cart>> }) {
  const [times, setTimes] = React.useState<string[]>([])
  const [form, setForm] = React.useState({ name: "", phone: "", email: "", pickupAt: "", notes: "", website: "" })
  const [errors, setErrors] = React.useState<{ [k: string]: string }>({})
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [placed, setPlaced] = React.useState<Placed | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!hasApi()) return setTimes(localPickupTimes())
    request<{ times: string[] }>("/api/orders/pickup-times")
      .then((r) => setTimes(r.times))
      .catch(() => setTimes(localPickupTimes()))
  }, [])

  const lines = Object.entries(cart)
    .map(([slug, qty]) => ({ dish: dishes.find((d) => d.slug === slug), qty }))
    .filter((l): l is { dish: Dish; qty: number } => !!l.dish && l.qty > 0)
  const estimate = lines.reduce((s, l) => s + l.dish.priceCents * l.qty, 0)
  const setQty = (slug: string, q: number) =>
    setCart((c) => {
      const n = { ...c }
      if (q <= 0) delete n[slug]
      else n[slug] = Math.min(20, q)
      return n
    })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: { [k: string]: string } = {}
    if (form.name.trim().length < 2) errs.name = "Please enter your name."
    if (!/^[+()\d\s-]{6,30}$/.test(form.phone.trim())) errs.phone = "Please enter a valid phone number."
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = "Please enter a valid email."
    if (!form.pickupAt) errs.pickupAt = "Please choose a collection time."
    if (!lines.length) errs.items = "Your order is empty."
    setErrors(errs)
    setMsg(null)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      // only slugs and quantities go up; the kitchen's prices come back
      const r = await post<Placed>("/api/orders", { ...form, items: lines.map((l) => ({ slug: l.dish.slug, qty: l.qty })) })
      setPlaced(r)
      setCart({})
    } catch (x) {
      const er = x as ApiError
      const fe: { [k: string]: string } = {}
      for (const d of er.details || []) fe[d.field.split(".")[0]] = d.message
      setErrors(fe)
      setMsg({ ok: false, text: er.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="order" className="band" aria-labelledby="order-h">
      <div className="wrap grid-2">
        <div>
          <p className="kicker">Takeaway</p>
          <h2 id="order-h" className="h2">
            Your <em>order</em>
          </h2>
          <p className="lead">Choose dishes from the book or the menu, pick a time today, and pay when you collect. The kitchen confirms every price.</p>
          {placed ? (
            <div className="note ok" role="status">
              <p style={{ margin: "0 0 8px" }}>
                Thank you. Order <strong>{placed.code}</strong> will be ready at <strong>{placed.pickupAt}</strong>.
              </p>
              <p style={{ margin: 0 }}>Total confirmed by the kitchen: {money(placed.totalCents)}</p>
            </div>
          ) : lines.length ? (
            <>
              <ul className="cart" aria-label="Dishes in your order">
                {lines.map((l) => (
                  <li key={l.dish.slug}>
                    <span className="name">{l.dish.name}</span>
                    <span className="qty">
                      <button type="button" onClick={() => setQty(l.dish.slug, l.qty - 1)} aria-label={"One fewer " + l.dish.name}>
                        −
                      </button>
                      <output aria-label={"Quantity of " + l.dish.name}>{l.qty}</output>
                      <button type="button" onClick={() => setQty(l.dish.slug, l.qty + 1)} aria-label={"One more " + l.dish.name}>
                        +
                      </button>
                    </span>
                    <span>{money(l.dish.priceCents * l.qty)}</span>
                  </li>
                ))}
              </ul>
              <p className="total">
                <span>Estimated total</span>
                <span>{money(estimate)}</span>
              </p>
            </>
          ) : (
            <p className="note">Your order is empty. Add dishes from the book above or from the full menu.</p>
          )}
          {errors.items && <p className="err">{errors.items}</p>}
        </div>
        {!placed && (
          <form className="form" onSubmit={submit} noValidate aria-labelledby="order-h">
            <div className="field">
              <label htmlFor="o-name">Name</label>
              <input id="o-name" className="input" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={errors.name ? "o-name-e" : undefined} />
              {errors.name && <p id="o-name-e" className="err">{errors.name}</p>}
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="o-phone">Phone</label>
                <input id="o-phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "o-phone-e" : undefined} />
                {errors.phone && <p id="o-phone-e" className="err">{errors.phone}</p>}
              </div>
              <div className="field">
                <label htmlFor="o-email">Email (optional)</label>
                <input id="o-email" className="input" type="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "o-email-e" : undefined} />
                {errors.email && <p id="o-email-e" className="err">{errors.email}</p>}
              </div>
            </div>
            <div className="field">
              <label htmlFor="o-time">Collect today at</label>
              <select id="o-time" className="input" value={form.pickupAt} onChange={set("pickupAt")} aria-invalid={!!errors.pickupAt} aria-describedby={errors.pickupAt ? "o-time-e" : undefined}>
                <option value="">{times.length ? "Choose a time" : "No collection times left today"}</option>
                {times.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {errors.pickupAt && <p id="o-time-e" className="err">{errors.pickupAt}</p>}
            </div>
            <div className="field">
              <label htmlFor="o-notes">Notes for the kitchen</label>
              <textarea id="o-notes" className="input" value={form.notes} onChange={set("notes")} maxLength={500} />
            </div>
            <div className="hp" aria-hidden="true">
              <label htmlFor="o-web">Leave this empty</label>
              <input id="o-web" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
            </div>
            {msg && (
              <p className={"note " + (msg.ok ? "ok" : "bad")} role="alert">
                {msg.text}
              </p>
            )}
            <button type="submit" className="btn solid" disabled={busy}>
              {busy ? "Sending…" : "Place order"}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
