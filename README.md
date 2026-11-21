# Ember & Olive — the menu you can turn

A restaurant website built around a black leather menu book lying on a walnut
table. A gold sheen crosses the embossed logo, the cover swings open, and you turn
cream pages by scrolling, swiping, with the arrow keys or the tabs. When a
signature dish arrives, its photograph rises off the page in real 3D (three.js):
the plate lifts, the food gains height, the shadow grows and a little steam
curls up. The drink fizzes instead. The dish settles back flat before the page
turns, and the printed text is never covered or distorted.

Behind it is a full-stack app: menu management, atomic table reservations,
takeaway orders priced on the server, a newsletter and a contact form, with a
small staff area at `#/admin`.

**Live site:** https://codelady-ship.github.io/ember-olive-menu/ (after GitHub Pages is enabled)

## Stack

| Part | Tech |
|---|---|
| Site | React 19, Vite, TypeScript, three.js (lazy loaded), GSAP |
| API | Node 20, Express, TypeScript, MongoDB / Mongoose, zod, helmet, JWT + bcrypt, multer |
| Tests | Vitest, Supertest, mongodb-memory-server |
| Hosting | GitHub Pages (site), Render (API), MongoDB Atlas (data) |

## How the book works

- **Scroll-scrubbed, never trapped.** A tall section holds a sticky stage; the
  scroll position decides how far each leaf has turned. Nothing pins or rewrites
  your scroll, so the page always moves on below the book.
- **Real leaves.** Each leaf is a two-sided element turned with `rotateY`, with a
  moving fold shadow and page shading. Desktop shows spreads; phones show one
  page at a time.
- **Dishes rise only at rest.** When a dish photo page has been still for a
  moment, its 3D twin replaces the print pixel-for-pixel and lifts. Turning away
  lowers it first. A depth map displaces the photo's mesh, and the lighting
  comes from that same depth.
- **Fallbacks.** Phones, low-memory devices and browsers without WebGL get a CSS
  lift with drawn steam or bubbles. With *reduced motion* the pages change with a
  calm fade and nothing rises.
- **View in 3D.** Each signature dish opens in a viewer on a table. You can turn
  it by dragging or with the arrow keys.
- **Data driven.** The book is built from `GET /api/menu`. Without an API (or if
  it takes more than 8 seconds) it uses the same menu bundled from
  `shared/menu.json`, so the site always works.

## Run it locally

Requires Node 20+ and MongoDB, either local or an Atlas connection string.

```bash
# API
cd backend
cp .env.example .env        # fill in MONGODB_URI, JWT_SECRET, CORS_ORIGINS=http://localhost:5173
npm install
npm run seed                # loads shared/menu.json
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long passphrase' npm run create-admin
npm run dev                 # http://localhost:4000/api/health

# Site (another terminal)
cd frontend
cp .env.example .env.local  # VITE_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:5173/
```

The staff area lives at `http://localhost:5173/#/admin`. On localhost only, you
can also point the site at another local API with `?api=http://localhost:4001`.

**Demo admin.** The sign-in page has a **Demo admin** button. With the API up it
signs in as `demo@ember-olive.demo` / `demo1234` (public on purpose), a `demo`
role created by `npm run seed` and on every server start: it opens every admin
page, but every write answers 403 "Demo admin is read-only" (shown as a toast).
It never sees guest data: names, emails, phones, notes, subjects and message
text are replaced on the server by fixed placeholders
(`backend/src/lib/demo.ts`, deny-by-default: an admin GET that is not listed
there answers 403 for this role, and only listed query parameters are passed
on). `DEMO_ADMIN=false` turns it off: the demo login is refused, demo tokens
issued earlier are rejected at once, and the account is deleted on the next
start or `npm run seed`. When the API is not set or not
reachable, the button opens an in-browser sandbox built from `shared/menu.json`
with sample bookings and orders; changes stay in that tab (sessionStorage) and
**Reset demo data** starts over.

## Tests

```bash
cd backend && npm test      # 32 tests: menu, orders priced on the server, auth, admin CRUD,
                            # uploads, and 12 parallel bookings for a 10-seat slot (exactly 5 win)
cd frontend && npm test     # 11 tests: menu mapping, demo fallback, API base rules, JSON-LD, page building
```

## Images

The four featured dishes need two files each, in `frontend/public/menu/`:

| Slot | Size | What |
|---|---|---|
| `<slug>.webp` | 1024 × 1024, transparent | The dish cut out from top-down: a plate, or a glass standing upright |
| `<slug>-depth.webp` | 512 × 512, greyscale | Height map: white is high, black is the page |
| `<slug>.mp4` (optional) | short loop | Shown instead of the 3D on pages that set `video` |
| `frontend/public/promo/menu-story.mp4` | 9:16, 1080 × 1920 | The story film. `menu-story-poster.webp` is shown until it exists |

`tools/prepare-assets.mjs` makes the cut-outs and depth maps from ordinary
photos (`cd tools && npm install && npm run assets`). Dishes added through the
staff area can upload their own images. Photo sources and licences are listed
in [docs/CREDITS.md](docs/CREDITS.md).

## Deploy

1. **Database:** create a free MongoDB Atlas cluster and copy its connection string.
2. **API:** in Render, choose *New → Blueprint* and pick this repo (`render.yaml`).
   Set `MONGODB_URI` there. Then run `npm run seed` and `npm run create-admin`
   once from the Render shell.
   Uploaded images on the free plan disappear on redeploy, so use `menu/...`
   files or https image URLs for anything permanent.
3. **Site:** in the repo, set the Actions variable `VITE_API_URL` to the Render
   URL. Then under *Settings → Pages*, set the source to **GitHub Actions**.
   Every push to `main` builds and deploys the site.

## SEO

Each build writes meta tags, Open Graph tags, a canonical link and JSON-LD
(`Restaurant`, `Menu` / `MenuSection` / `MenuItem`, and an `FAQPage` that matches
the visible FAQ). It also writes a static copy of the whole menu inside
`#root` for crawlers, plus `sitemap.xml`, `robots.txt` and `llms.txt`.

## Docs

- [API reference](docs/API.md)
- [Credits and licences](docs/CREDITS.md)

## Licence

The code is MIT. The page-turning mechanics are adapted from the MIT-licensed
*Biryani Legends Template* by Kedhareswer Naidu, and its notice is kept in
[LICENSE](LICENSE). The photographs keep their own Creative Commons licences,
listed in [docs/CREDITS.md](docs/CREDITS.md).

Ember & Olive is a fictional restaurant: the address and phone number are
placeholders.
