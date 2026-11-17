import * as React from "react"
import { ApiError, hasApi, post, request } from "../lib/api"

type Slot = { time: string; seatsLeft: number; available: boolean; reason: string | null }
const SEATINGS = ["12:00", "12:30", "13:00", "13:30", "14:00", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"]

const iso = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")

export default function Reserve() {
  const today = React.useMemo(() => new Date(), [])
  const max = React.useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() + 90)
    return d
  }, [today])
  const [form, setForm] = React.useState({ date: "", time: "", partySize: "2", name: "", email: "", phone: "", notes: "", website: "" })
  const [slots, setSlots] = React.useState<Slot[] | null>(null)
  const [maxParty, setMaxParty] = React.useState(10)
  const [errors, setErrors] = React.useState<{ [k: string]: string }>({})
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [booked, setBooked] = React.useState<{ code: string; date: string; time: string; partySize: number } | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  React.useEffect(() => {
    setSlots(null)
    setForm((f) => ({ ...f, time: "" }))
    if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return
    if (new Date(form.date + "T12:00:00").getDay() === 1) {
      setSlots(SEATINGS.map((time) => ({ time, seatsLeft: 0, available: false, reason: "We are closed on Mondays." })))
      return
    }
    if (!hasApi()) {
      setSlots(SEATINGS.map((time) => ({ time, seatsLeft: 24, available: true, reason: null })))
      return
    }
    let live = true
    request<{ slots: Slot[]; maxParty: number }>("/api/reservations/availability?date=" + form.date)
      .then((r) => {
        if (!live) return
        setSlots(r.slots)
        setMaxParty(r.maxParty)
      })
      .catch((e: ApiError) => live && setErrors((x) => ({ ...x, date: e.message })))
    return () => {
      live = false
    }
  }, [form.date])

  const party = Number(form.partySize)
  const closed = slots?.every((s) => !s.available)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: { [k: string]: string } = {}
    if (!form.date) errs.date = "Please choose a date."
    if (!form.time) errs.time = "Please choose a seating."
    if (form.name.trim().length < 2) errs.name = "Please enter your name."
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = "Please enter a valid email."
    if (form.phone && !/^[+()\d\s-]{6,30}$/.test(form.phone)) errs.phone = "Please enter a valid phone number."
    setErrors(errs)
    setMsg(null)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const r = await post<{ code: string; date: string; time: string; partySize: number }>("/api/reservations", { ...form, partySize: party })
      setBooked(r)
    } catch (x) {
      const er = x as ApiError
      const fe: { [k: string]: string } = {}
      for (const d of er.details || []) fe[d.field] = d.message
      setErrors(fe)
      setMsg({ ok: false, text: er.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="reserve" className="band" aria-labelledby="reserve-h">
      <div className="wrap grid-2">
        <div>
          <p className="kicker">Reservations</p>
          <h2 id="reserve-h" className="h2">
            A table by the <em>fire</em>
          </h2>
          <p className="lead">Pick a date to see which seatings still have room. We hold every table for fifteen minutes. Parties over {maxParty}: please call.</p>
          {booked && (
            <div className="note ok" role="status">
              Booked. Your reference is <strong>{booked.code}</strong>: a table for {booked.partySize} on {new Date(booked.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at {booked.time}.
            </div>
          )}
        </div>
        {!booked && (
          <form className="form" onSubmit={submit} noValidate aria-labelledby="reserve-h">
            <div className="row">
              <div className="field">
                <label htmlFor="r-date">Date</label>
                <input id="r-date" className="input" type="date" min={iso(today)} max={iso(max)} value={form.date} onChange={set("date")} aria-invalid={!!errors.date} aria-describedby={errors.date ? "r-date-e" : undefined} />
                {errors.date && <p id="r-date-e" className="err">{errors.date}</p>}
              </div>
              <div className="field">
                <label htmlFor="r-party">Guests</label>
                <select id="r-party" className="input" value={form.partySize} onChange={set("partySize")}>
                  {Array.from({ length: maxParty }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "guest" : "guests"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <fieldset className="slots" aria-describedby={errors.time ? "r-time-e" : "r-time-hint"}>
              <legend className="legend" style={{ marginBottom: 8 }}>
                Seating
              </legend>
              {!slots && (
                <p id="r-time-hint" className="note" style={{ width: "100%" }}>
                  Choose a date first.
                </p>
              )}
              {closed && slots && <p className="note" style={{ width: "100%" }}>{slots[0]?.reason || "No seatings left on this day."}</p>}
              {slots?.map((s) => {
                const ok = s.available && s.seatsLeft >= party
                return (
                  <label key={s.time} className="slot">
                    <input type="radio" name="time" value={s.time} checked={form.time === s.time} disabled={!ok} onChange={set("time")} />
                    <span>
                      {s.time}
                      {s.available && s.seatsLeft < party ? " · full" : ""}
                    </span>
                  </label>
                )
              })}
              {errors.time && (
                <p id="r-time-e" className="err" style={{ width: "100%" }}>
                  {errors.time}
                </p>
              )}
            </fieldset>
            <div className="field">
              <label htmlFor="r-name">Name</label>
              <input id="r-name" className="input" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={errors.name ? "r-name-e" : undefined} />
              {errors.name && <p id="r-name-e" className="err">{errors.name}</p>}
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="r-email">Email</label>
                <input id="r-email" className="input" type="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "r-email-e" : undefined} />
                {errors.email && <p id="r-email-e" className="err">{errors.email}</p>}
              </div>
              <div className="field">
                <label htmlFor="r-phone">Phone (optional)</label>
                <input id="r-phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "r-phone-e" : undefined} />
                {errors.phone && <p id="r-phone-e" className="err">{errors.phone}</p>}
              </div>
            </div>
            <div className="field">
              <label htmlFor="r-notes">Allergies, occasions, high chair…</label>
              <textarea id="r-notes" className="input" value={form.notes} onChange={set("notes")} maxLength={500} />
            </div>
            <div className="hp" aria-hidden="true">
              <label htmlFor="r-web">Leave this empty</label>
              <input id="r-web" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
            </div>
            {msg && (
              <p className={"note " + (msg.ok ? "ok" : "bad")} role="alert">
                {msg.text}
              </p>
            )}
            <button type="submit" className="btn solid" disabled={busy}>
              {busy ? "Booking…" : "Reserve"}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
