import type { Plugin } from "vite"
import { FAQ } from "./src/content/faq"
import { SITE } from "./src/content/site"
import { menuFromSeed } from "./src/lib/menu"
import { jsonLd, llmsTxt, staticMenuHtml } from "./src/lib/seo"

/**
 * Build-time SEO / GEO: meta tags, canonical, Open Graph, JSON-LD (Restaurant,
 * Menu with sections and items, FAQPage), a crawlable HTML menu inside #root,
 * and sitemap.xml, robots.txt and llms.txt. All from the same data the page shows.
 */
export function seo(siteUrl: string): Plugin {
  const url = siteUrl.endsWith("/") ? siteUrl : siteUrl + "/"
  const site = { ...SITE, url }
  const menu = menuFromSeed()
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
  const title = SITE.name + " — Wood-fired restaurant & 3D menu book"
  const desc = SITE.metaDescription
  // The first featured dish is the largest image on first paint (LCP): preload it.
  const lcpImage = menu.featured[0]?.image
  let base = "/"
  return {
    name: "ember-olive-seo",
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml(html) {
      const ld = jsonLd(menu, site, FAQ, url)
        .map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`)
        .join("\n    ")
      const head = [
        `<title>${esc(title)}</title>`,
        `<meta name="description" content="${esc(desc)}" />`,
        `<link rel="canonical" href="${url}" />`,
        `<meta property="og:type" content="restaurant.restaurant" />`,
        `<meta property="og:site_name" content="${esc(SITE.name)}" />`,
        `<meta property="og:title" content="${esc(title)}" />`,
        `<meta property="og:description" content="${esc(desc)}" />`,
        `<meta property="og:url" content="${url}" />`,
        `<meta property="og:image" content="${url}og.jpg" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta property="og:image:alt" content="The Ember &amp; Olive leather menu open on a walnut table" />`,
        `<meta property="og:locale" content="en_GB" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${esc(title)}" />`,
        `<meta name="twitter:description" content="${esc(desc)}" />`,
        `<meta name="twitter:image" content="${url}og.jpg" />`,
        lcpImage && lcpImage.startsWith("menu/") ? `<link rel="preload" as="image" type="image/webp" href="${base}${lcpImage}" fetchpriority="high" />` : "",
        ld,
      ].join("\n    ")
      return html.replace("<!--seo-->", head).replace("<!--prerender-->", staticMenuHtml(menu, site, FAQ))
    },
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10)
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
      })
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\n\nSitemap: ${url}sitemap.xml\n` })
      this.emitFile({ type: "asset", fileName: "llms.txt", source: llmsTxt(menu, site, FAQ) })
    },
  }
}
