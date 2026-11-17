/**
 * Restaurant facts. Ember & Olive is a fictional restaurant made for a
 * portfolio piece: the address and phone below are placeholders (the phone is
 * from Ofcom's range reserved for drama), so nobody is sent anywhere real.
 */
export const SITE = {
  name: "Ember & Olive",
  tagline: "Wood fire, olive oil and a menu you can turn",
  description:
    "Ember & Olive is a wood-fired Mediterranean–British restaurant. Turn the pages of our leather menu: truffle tagliatelle, eggs Benedict, fish & chips and the Ruby Citrus Fizz rise from the page in 3D. Book a table or order takeaway.",
  /** Short version (under 160 characters) for the meta description and social cards. */
  metaDescription:
    "Ember & Olive is a fictional wood-fired restaurant with a 3D leather menu book: turn the pages, see dishes rise, book a table or order takeaway.",
  url: (import.meta.env?.VITE_SITE_URL as string | undefined) || "https://codelady-ship.github.io/ember-olive-menu/",
  phone: "+44 20 7946 0321",
  email: "hello@example.com",
  address: { street: "12 Olive Yard", locality: "London", postalCode: "SE1 0AA", country: "GB" },
  priceRange: "££",
  cuisine: ["Mediterranean", "British", "Italian"],
  /** Kept in step with backend/src/lib/time.ts (closed Mondays). */
  hours: [
    { days: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: "12:00", closes: "15:00" },
    { days: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: "18:00", closes: "23:00" },
  ],
  hoursText: ["Tuesday to Sunday", "Lunch 12:00–15:00", "Dinner 18:00–23:00", "Closed on Mondays"],
  socials: [{ label: "Instagram", href: "https://www.instagram.com/" }],
  demoNote: "Ember & Olive is a fictional restaurant made as a portfolio project. The address and phone number are placeholders.",
}
