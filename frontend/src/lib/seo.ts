/**
 * Structured data and crawlable HTML for the menu. Used twice from the same
 * data: by the Vite plugin at build time (index.html, sitemap, llms.txt) and by
 * the page, so what search engines read is what visitors see.
 */
import type { Menu } from "./menu"

type Site = {
  name: string
  description: string
  demoNote?: string
  url: string
  phone: string
  email: string
  address: { street: string; locality: string; postalCode: string; country: string }
  priceRange: string
  cuisine: string[]
  hours: { days: string[]; opens: string; closes: string }[]
}

const price = (c: number) => (c / 100).toFixed(2)
const SUITABLE: { [k: string]: string } = { vegetarian: "https://schema.org/VegetarianDiet", vegan: "https://schema.org/VeganDiet", "gluten-free": "https://schema.org/GlutenFreeDiet" }

export function jsonLd(menu: Menu, site: Site, faq: { q: string; a: string }[], imageBase: string) {
  const menuId = site.url + "#menu"
  const restaurant = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": site.url + "#restaurant",
    name: site.name,
    description: site.description,
    disambiguatingDescription: site.demoNote,
    url: site.url,
    telephone: site.phone,
    email: site.email,
    image: imageBase + "og.jpg",
    servesCuisine: site.cuisine,
    priceRange: site.priceRange,
    acceptsReservations: "True",
    address: { "@type": "PostalAddress", streetAddress: site.address.street, addressLocality: site.address.locality, postalCode: site.address.postalCode, addressCountry: site.address.country },
    openingHoursSpecification: site.hours.map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: h.days, opens: h.opens, closes: h.closes })),
    hasMenu: { "@id": menuId },
  }
  const menuLd = {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": menuId,
    name: site.name + " menu",
    inLanguage: "en-GB",
    hasMenuSection: menu.sections.map((s) => ({
      "@type": "MenuSection",
      name: s.title,
      description: s.subtitle || undefined,
      hasMenuItem: s.dishes.map((d) => ({
        "@type": "MenuItem",
        name: d.name,
        description: d.description || undefined,
        image: d.image && /^menu\//.test(d.image) ? imageBase + d.image : undefined,
        offers: { "@type": "Offer", price: price(d.priceCents), priceCurrency: "GBP", availability: d.available ? "https://schema.org/InStock" : "https://schema.org/SoldOut" },
        suitableForDiet: d.badges.filter((b) => SUITABLE[b]).map((b) => SUITABLE[b]),
      })),
    })),
  }
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  }
  return [restaurant, menuLd, faqLd]
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** A plain HTML menu put inside #root at build time; React replaces it on load. */
export function staticMenuHtml(menu: Menu, site: Site, faq: { q: string; a: string }[]) {
  const sections = menu.sections
    .map(
      (s) =>
        `<section><h2>${esc(s.title)}</h2>${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ""}<ul>${s.dishes
          .map((d) => `<li><strong>${esc(d.name)}</strong> — £${price(d.priceCents)}. ${esc(d.description)}</li>`)
          .join("")}</ul></section>`,
    )
    .join("")
  const faqs = faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("")
  return `<main class="eo-prerender"><h1><span translate="no">${esc(site.name)}</span></h1><p>${esc(site.description)}</p>${sections}<h2>Questions</h2><dl>${faqs}</dl></main>`
}

/** llms.txt: a short, plain description for AI assistants. */
export function llmsTxt(menu: Menu, site: Site & { hoursText: string[]; demoNote: string }, faq: { q: string; a: string }[]) {
  const lines = [
    "# " + site.name,
    "",
    "> " + site.description,
    "",
    "Note: " + site.demoNote,
    "",
    "## Visit",
    "",
    "- Address: " + [site.address.street, site.address.locality, site.address.postalCode].join(", "),
    ...site.hoursText.map((h) => "- " + h),
    "- Reservations and takeaway: " + site.url,
    "",
    "## Menu",
    "",
  ]
  for (const s of menu.sections) {
    lines.push("### " + s.title, "")
    for (const d of s.dishes) lines.push("- " + d.name + " (£" + price(d.priceCents) + "): " + d.description + (d.allergens.length ? " Allergens: " + d.allergens.join(", ") + "." : ""))
    lines.push("")
  }
  lines.push("## FAQ", "")
  for (const f of faq) lines.push("- Q: " + f.q, "  A: " + f.a)
  return lines.join("\n") + "\n"
}
