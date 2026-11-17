import demo from "../../../shared/menu.json"

export type Effect = "steam" | "fizz" | "none"
export type Dish = {
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
  effect: Effect
  image: string
  depthImage: string
  video: string
  alt: string
}
export type Section = { slug: string; title: string; subtitle: string; order: number; dishes: Dish[] }
export type Menu = { sections: Section[]; featured: Dish[] }

type RawDish = Partial<Dish> & { slug: string; name: string; section: string; priceCents: number }

const normal = (d: RawDish): Dish => ({
  description: "",
  story: "",
  allergens: [],
  badges: [],
  available: true,
  featured: false,
  featuredOrder: 0,
  effect: "none",
  image: "",
  depthImage: "",
  video: "",
  alt: "",
  ...d,
})

/** Build the same shape GET /api/menu returns from the shared starter menu. */
export function menuFromSeed(data: { sections: Omit<Section, "dishes">[]; dishes: (RawDish & { order?: number })[] } = demo as never): Menu {
  const sorted = [...data.dishes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
  const dishes = sorted.map(({ order: _o, ...d }) => normal(d))
  return {
    sections: [...data.sections]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ ...s, subtitle: s.subtitle || "", dishes: dishes.filter((d) => d.section === s.slug) })),
    featured: dishes.filter((d) => d.featured).sort((a, b) => a.featuredOrder - b.featuredOrder),
  }
}

export const DEMO_MENU = menuFromSeed()

export const money = (cents: number) => "£" + (cents / 100).toFixed(cents % 100 ? 2 : 0)

export const ALLERGEN_LABEL: { [k: string]: string } = {
  celery: "Celery", gluten: "Gluten", crustaceans: "Crustaceans", eggs: "Eggs", fish: "Fish", lupin: "Lupin", milk: "Milk",
  molluscs: "Molluscs", mustard: "Mustard", nuts: "Tree nuts", peanuts: "Peanuts", sesame: "Sesame", soya: "Soya", sulphites: "Sulphites",
}
export const BADGE_LABEL: { [k: string]: string } = {
  signature: "Signature", "chef-pick": "Chef’s pick", new: "New", vegetarian: "Vegetarian", vegan: "Vegan",
  "gluten-free": "Gluten free", spicy: "Spicy", "non-alcoholic": "Alcohol free",
}
