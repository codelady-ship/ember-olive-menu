import { ALLERGEN_LABEL, BADGE_LABEL, money, type Dish, type Menu } from "../lib/menu"

/** The whole menu as plain, accessible HTML (the same data as the book). */
export default function FullMenu({ menu, onAdd, demo }: { menu: Menu; onAdd: (d: Dish) => void; demo: boolean }) {
  return (
    <section id="menu" className="band" aria-labelledby="menu-h">
      <div className="wrap">
        <p className="kicker">The full menu</p>
        <h2 id="menu-h" className="h2">
          Everything on the <em>table</em>
        </h2>
        <p className="lead">
          The same dishes as the book, in one list. Allergens are listed under each dish; ask us about anything else.
          {demo && " You are looking at the sample menu that ships with the site."}
        </p>
        <div className="menu-cols">
          {menu.sections.map((s) => (
            <section key={s.slug} className="menu-sec" aria-labelledby={"sec-" + s.slug}>
              <h3 id={"sec-" + s.slug}>{s.title}</h3>
              {s.subtitle && <p>{s.subtitle}</p>}
              <ul className="menu-list">
                {s.dishes.map((d) => (
                  <li key={d.slug} className="menu-item">
                    <h4>{d.name}</h4>
                    <span className="price">{money(d.priceCents)}</span>
                    <p>
                      {d.description} {!d.available && <span className="soldout">Sold out today.</span>}
                    </p>
                    {(d.badges.length > 0 || d.allergens.length > 0) && (
                      <p className="meta">
                        {[...d.badges.map((b) => BADGE_LABEL[b] || b), d.allergens.length ? "Allergens: " + d.allergens.map((a) => ALLERGEN_LABEL[a] || a).join(", ") : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <div className="row">
                      <button type="button" className="btn small" onClick={() => onAdd(d)} disabled={!d.available} aria-label={"Add " + d.name + " to your order"}>
                        Add to order
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </section>
  )
}
