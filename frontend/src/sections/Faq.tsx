import { FAQ } from "../content/faq"

/** The same questions and answers as the FAQPage JSON-LD in index.html. */
export default function Faq() {
  return (
    <section id="faq" className="band faq" aria-labelledby="faq-h">
      <div className="wrap">
        <p className="kicker">Good to know</p>
        <h2 id="faq-h" className="h2">
          Questions at the <em>pass</em>
        </h2>
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
