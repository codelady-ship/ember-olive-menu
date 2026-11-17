import { SITE } from "../content/site"

export default function Footer() {
  return (
    <footer className="site-foot">
      <div className="wrap foot-grid">
        <div>
          <p style={{ fontFamily: "var(--f-display)", fontSize: 28, color: "var(--chrome)", margin: "0 0 8px" }} translate="no">
            {SITE.name}
          </p>
          <p style={{ margin: "0 0 8px" }}>{SITE.demoNote}</p>
          <p style={{ margin: 0 }}>
            Dish photographs: Wikimedia Commons contributors (CC0, CC BY, CC BY-SA), see{" "}
            <a href="https://github.com/codelady-ship/ember-olive-menu/blob/main/docs/CREDITS.md">credits</a>. Page-turning after the{" "}
            <a href="https://kedhar-components.pages.dev/#biryani-legends-template">Biryani Legends Template</a> by Kedhareswer Naidu (MIT).
          </p>
        </div>
        <nav aria-label="Footer">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, lineHeight: 2.4 }}>
            <li>
              <a href="#menu">Menu</a>
            </li>
            <li>
              <a href="#reserve">Reservations</a>
            </li>
            <li>
              <a href="#order">Takeaway</a>
            </li>
            <li>
              <a href="#faq">FAQ</a>
            </li>
            <li>
              <a href="#contact">Contact</a>
            </li>
          </ul>
        </nav>
        <div>
          <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, lineHeight: 1.8 }}>
            {SITE.hoursText.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <a href="#/admin" rel="nofollow">
            Staff sign-in
          </a>
        </div>
      </div>
    </footer>
  )
}
