import * as React from "react"
import { ApiError, post } from "../lib/api"
import { SITE } from "../content/site"

export default function Contact() {
  const [form, setForm] = React.useState({ name: "", email: "", subject: "", message: "", website: "" })
  const [errors, setErrors] = React.useState<{ [k: string]: string }>({})
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: { [k: string]: string } = {}
    if (form.name.trim().length < 2) errs.name = "Please enter your name."
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = "Please enter a valid email."
    if (form.message.trim().length < 10) errs.message = "A few more words, please."
    setErrors(errs)
    setMsg(null)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await post("/api/contact", form)
      setMsg({ ok: true, text: "Thank you, we’ll write back within a day." })
      setForm({ name: "", email: "", subject: "", message: "", website: "" })
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
    <section id="contact" className="band" aria-labelledby="contact-h">
      <div className="wrap grid-2">
        <div>
          <p className="kicker">Contact</p>
          <h2 id="contact-h" className="h2">
            Write to the <em>kitchen</em>
          </h2>
          <p className="lead">Private dining, allergies, a birthday cake: tell us and we’ll answer.</p>
          <address style={{ fontStyle: "normal", lineHeight: 1.8 }}>
            <span translate="no">{SITE.name}</span>
            <br />
            {SITE.address.street}, {SITE.address.locality} {SITE.address.postalCode}
            <br />
            <a className="tap" href={"tel:" + SITE.phone.replace(/\s/g, "")}>{SITE.phone}</a>
          </address>
          <ul style={{ listStyle: "none", padding: 0, color: "var(--chrome-muted)" }}>
            {SITE.hoursText.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
        <form className="form" onSubmit={submit} noValidate aria-labelledby="contact-h">
          <div className="row">
            <div className="field">
              <label htmlFor="c-name">Name</label>
              <input id="c-name" className="input" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={errors.name ? "c-name-e" : undefined} />
              {errors.name && <p id="c-name-e" className="err">{errors.name}</p>}
            </div>
            <div className="field">
              <label htmlFor="c-email">Email</label>
              <input id="c-email" className="input" type="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "c-email-e" : undefined} />
              {errors.email && <p id="c-email-e" className="err">{errors.email}</p>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-subject">Subject (optional)</label>
            <input id="c-subject" className="input" value={form.subject} onChange={set("subject")} maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="c-message">Message</label>
            <textarea id="c-message" className="input" value={form.message} onChange={set("message")} maxLength={2000} aria-invalid={!!errors.message} aria-describedby={errors.message ? "c-message-e" : undefined} />
            {errors.message && <p id="c-message-e" className="err">{errors.message}</p>}
          </div>
          <div className="hp" aria-hidden="true">
            <label htmlFor="c-web">Leave this empty</label>
            <input id="c-web" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
          </div>
          {msg && (
            <p className={"note " + (msg.ok ? "ok" : "bad")} role={msg.ok ? "status" : "alert"}>
              {msg.text}
            </p>
          )}
          <button type="submit" className="btn solid" disabled={busy}>
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
      </div>
    </section>
  )
}
