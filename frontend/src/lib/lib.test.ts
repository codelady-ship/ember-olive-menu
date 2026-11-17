import { describe, expect, it } from "vitest"
import { apiBase, mediaUrl } from "./api"
import { DEMO_MENU, menuFromSeed, money } from "./menu"
import { jsonLd, llmsTxt, staticMenuHtml } from "./seo"
import { FAQ } from "../content/faq"
import { SITE } from "../content/site"
import { buildPages } from "../book/MenuBook"

describe("API address", () => {
  const env = "https://api.example.com/"
  it("uses VITE_API_URL without a trailing slash", () => {
    expect(apiBase({ hostname: "codelady-ship.github.io", search: "" }, env)).toBe("https://api.example.com")
  })
  it("ignores ?api= on the public site", () => {
    expect(apiBase({ hostname: "codelady-ship.github.io", search: "?api=https://evil.example" }, env)).toBe("https://api.example.com")
    expect(apiBase({ hostname: "codelady-ship.github.io", search: "?api=http://localhost:4000" }, env)).toBe("https://api.example.com")
  })
  it("honours ?api= only on localhost, and only for a local server", () => {
    expect(apiBase({ hostname: "localhost", search: "?api=http://localhost:4000" }, env)).toBe("http://localhost:4000")
    expect(apiBase({ hostname: "localhost", search: "?api=https://evil.example" }, env)).toBe("https://api.example.com")
  })
  it("has no API when nothing is configured (demo mode)", () => {
    expect(apiBase({ hostname: "codelady-ship.github.io", search: "" }, undefined)).toBe("")
  })
})

describe("media paths", () => {
  it("resolves site assets and refuses anything odd", () => {
    expect(mediaUrl("menu/fish-and-chips.webp")).toBe("/menu/fish-and-chips.webp")
    expect(mediaUrl("https://cdn.example.com/a.webp")).toBe("https://cdn.example.com/a.webp")
    expect(mediaUrl("javascript:alert(1)")).toBe("")
    expect(mediaUrl("../secret.png")).toBe("")
  })
})

describe("the menu and the book", () => {
  it("puts the featured dishes in the owner's order", () => {
    expect(DEMO_MENU.featured.map((d) => d.name)).toEqual(["Truffle Tagliatelle", "Eggs Benedict", "Fish & Chips", "Ruby Citrus Fizz"])
  })
  it("makes whole spreads: contents, a spread per featured dish, menu pages, visit, closing", () => {
    const pages = buildPages(DEMO_MENU)
    expect(pages.length % 2).toBe(0)
    expect(pages.slice(0, 2).map((p) => p.kind)).toEqual(["contents", "title"])
    expect(pages.slice(2, 10).map((p) => p.kind)).toEqual(["dish-text", "dish-photo", "dish-text", "dish-photo", "dish-text", "dish-photo", "dish-text", "dish-photo"])
    expect(pages.slice(-4).map((p) => p.kind)).toEqual(["visit", "visit-r", "closing", "colophon"])
    // every dish appears on a menu page
    const listed = pages.flatMap((p) => (p.kind === "section" ? p.dishes.map((d) => d.slug) : []))
    expect(listed.sort()).toEqual(DEMO_MENU.sections.flatMap((s) => s.dishes.map((d) => d.slug)).sort())
  })
  it("splits a long section over pages", () => {
    const many = { sections: [{ slug: "a", title: "A", subtitle: "", order: 1 }], dishes: Array.from({ length: 12 }, (_, i) => ({ slug: "d" + i, name: "D" + i, section: "a", priceCents: 100 })) }
    const pages = buildPages(menuFromSeed(many))
    expect(pages.filter((p) => p.kind === "section")).toHaveLength(3)
    expect(pages.length % 2).toBe(0)
  })
  it("formats money", () => {
    expect(money(1950)).toBe("£19.50")
    expect(money(1700)).toBe("£17")
  })
})

describe("structured data matches what is on the page", () => {
  const ld = jsonLd(DEMO_MENU, SITE, FAQ, "https://x.test/")
  it("describes the restaurant, every menu item and every FAQ", () => {
    const [restaurant, menu, faq] = ld as unknown as [Record<string, unknown>, { hasMenuSection: { hasMenuItem: { name: string; offers: { price: string } }[] }[] }, { mainEntity: { name: string }[] }]
    expect(restaurant["@type"]).toBe("Restaurant")
    const items = menu.hasMenuSection.flatMap((s) => s.hasMenuItem)
    expect(items).toHaveLength(DEMO_MENU.sections.reduce((n, s) => n + s.dishes.length, 0))
    expect(items.find((i) => i.name === "Fish & Chips")!.offers.price).toBe("17.00")
    expect(faq.mainEntity.map((q) => q.name)).toEqual(FAQ.map((f) => f.q))
  })
  it("escapes HTML in the crawlable menu and writes llms.txt", () => {
    const html = staticMenuHtml(DEMO_MENU, SITE, FAQ)
    expect(html).toContain("Fish &amp; Chips")
    expect(html).not.toContain("<script")
    expect(llmsTxt(DEMO_MENU, SITE, FAQ)).toContain("Ruby Citrus Fizz (£7.50)")
  })
})
