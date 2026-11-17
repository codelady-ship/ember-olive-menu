import * as React from "react"
import MenuBook from "./book/MenuBook"
import { hasApi, loadMenu, post } from "./lib/api"
import { DEMO_MENU, type Dish, type Menu } from "./lib/menu"
import { SITE } from "./content/site"
import FullMenu from "./sections/FullMenu"
import OrderSection from "./sections/Order"
import Reserve from "./sections/Reserve"
import Story from "./sections/Story"
import Faq from "./sections/Faq"
import Contact from "./sections/Contact"
import Footer from "./sections/Footer"

const DishViewerModal = React.lazy(() => import("./sections/DishViewerModal"))

export type Cart = { [slug: string]: number }

export default function Site() {
  const [menu, setMenu] = React.useState<Menu>(DEMO_MENU)
  const [loading, setLoading] = React.useState(hasApi())
  const [demo, setDemo] = React.useState(!hasApi())
  const [cart, setCart] = React.useState<Cart>({})
  const [toast, setToast] = React.useState("")
  const [viewing, setViewing] = React.useState<{ dish: Dish; opener: HTMLElement | null } | null>(null)

  React.useEffect(() => {
    let live = true
    loadMenu().then((r) => {
      if (!live) return
      setMenu(r.menu)
      setDemo(r.demo)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [])

  React.useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(""), 4200)
    return () => window.clearTimeout(t)
  }, [toast])

  const dishes = React.useMemo(() => menu.sections.flatMap((s) => s.dishes), [menu])
  const add = React.useCallback((d: Dish) => {
    setCart((c) => ({ ...c, [d.slug]: Math.min(20, (c[d.slug] || 0) + 1) }))
    setToast("Added " + d.name + " to your order.")
  }, [])

  const subscribe = React.useCallback(async (email: string) => {
    if (!hasApi()) return "Sealed — though this preview isn’t connected to a server, so nothing was sent."
    await post("/api/newsletter", { email })
    return "Sealed. You’ll hear when the menu changes."
  }, [])

  return (
    <>
      <a className="skip-link" href="#menu">
        Skip to the menu
      </a>
      <div id="top" />
      <main>
        <h1 className="sr-only">
          <span translate="no">{SITE.name}</span> — {SITE.tagline}
        </h1>
        <MenuBook
          menu={menu}
          hold={loading}
          onAdd={add}
          onView3D={(dish) => setViewing({ dish, opener: document.activeElement as HTMLElement | null })}
          onSubscribe={subscribe}
        />
        <FullMenu menu={menu} onAdd={add} demo={demo} />
        <OrderSection dishes={dishes} cart={cart} setCart={setCart} />
        <Reserve />
        <Story />
        <Faq />
        <Contact />
      </main>
      <Footer />
      <div className="sr-only" aria-live="polite">
        {toast}
      </div>
      {toast && (
        <div className="toast" aria-hidden="true">
          <span>{toast}</span>
          <a href="#order">View order</a>
        </div>
      )}
      {viewing && (
        <React.Suspense fallback={null}>
          <DishViewerModal
            dish={viewing.dish}
            onClose={() => {
              const o = viewing.opener
              setViewing(null)
              o?.focus()
            }}
          />
        </React.Suspense>
      )}
    </>
  )
}
