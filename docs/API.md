# Ember & Olive API

Base URL: `https://<your-render-service>.onrender.com/api` (locally `http://localhost:4000/api`).
JSON in, JSON out. Errors are `{ "error": "message", "fields"?: { "<field>": "message" } }` with a 4xx/5xx status.
Money is always integer pence (`priceCents`, `totalCents`).

Rate limits: 600 requests / 15 min per IP on `/api`; forms (reservations, orders, newsletter, contact) 20 / 15 min; login 10 / 15 min.
Form bodies accept a hidden `website` honeypot field that must stay empty.

## Public

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| GET | `/menu` | `{ sections: [...], featured: [...] }` — sections with their available dishes; `featured` sorted by `featuredOrder` (this is the book order). |
| GET | `/dishes` | All available dishes. |
| GET | `/dishes/:slug` | One dish, 404 if missing or unavailable. |
| GET | `/reservations/availability?date=YYYY-MM-DD` | `{ date, capacity, maxParty, slots: [{ time, seatsLeft, available, reason }] }`. Closed Mondays; past seatings are not available. |
| POST | `/reservations` | Body `{ name, email, phone?, date, time, partySize, notes? }` → 201 `{ code, date, time, partySize, status }`. Seats are taken atomically per slot; 409 when the seating is full. Dates must be real calendar dates, not in the past, within `RES_DAYS_AHEAD`. |
| GET | `/orders/pickup-times` | `{ times: ["HH:MM", ...] }` still possible today. |
| POST | `/orders` | Body `{ name, phone, email?, pickupAt, notes?, items: [{ slug, qty }] }` → 201 `{ code, pickupAt, items, totalCents, status }`. Prices are looked up on the server; client prices are ignored. Duplicate lines are merged. |
| POST | `/newsletter` | Body `{ email }` → 201 (idempotent: signing up twice is fine). |
| POST | `/contact` | Body `{ name, email, subject?, message }` → 201. |
| POST | `/auth/login` | Body `{ email, password }` → `{ token, email }`. Same error for unknown email and wrong password. |
| GET | `/auth/me` | Bearer token → `{ email }`. |

## Admin (Bearer JWT from `/auth/login`)

`/auth/login` answers `{ token, email, role }`. Role `demo` (the public demo admin seeded by `npm run seed`) may call every GET below; every other method answers 403 `Demo admin is read-only: changes are not saved.`

| Method | Path | Notes |
|---|---|---|
| GET / POST | `/admin/sections` | List / create `{ slug, title, subtitle?, order? }`. |
| PATCH / DELETE | `/admin/sections/:id` | PATCH changes only the fields sent. A section with dishes cannot be deleted (409). |
| GET / POST | `/admin/dishes` | List all (including unavailable) / create. Fields: `slug, name, section, description, story, priceCents, allergens[], badges[], available, featured, featuredOrder, order, effect (steam / fizz / none), image, depthImage, video, alt`. |
| PATCH / DELETE | `/admin/dishes/:id` | Partial update / remove. |
| POST | `/admin/uploads` | `multipart/form-data`, field `file`. JPEG, PNG or WebP (checked by magic bytes, else 415), up to `MAX_UPLOAD_MB`. The server picks the file name → `{ url: "/uploads/<uuid>.webp" }`. |
| GET | `/admin/reservations?date=&status=&page=` | Paged list. |
| PATCH | `/admin/reservations/:id` | `{ status: confirmed / cancelled / seated / no-show }`. Cancelling gives the seats back; re-confirming takes them again (409 if the seating has filled). |
| GET | `/admin/orders?status=&page=` | Paged list. |
| PATCH | `/admin/orders/:id` | `{ status: new / preparing / ready / collected / cancelled }`. |
| GET | `/admin/messages` · PATCH / DELETE `/admin/messages/:id` | Contact messages; PATCH `{ read: boolean }`. |
| GET | `/admin/subscribers` | Newsletter list. |

Media paths accepted on dishes: `/uploads/<uuid>.<ext>` (from the upload endpoint), `menu/<slug>.<ext>` (files shipped with the site) or an `https://` URL.

## Environment

See `backend/.env.example`. Required: `MONGODB_URI`, `JWT_SECRET` (32+ characters), `CORS_ORIGINS` (comma-separated site origins).
Create the first admin with `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin` (the password is hashed with bcrypt and never printed).
Load the menu with `npm run seed` (upserts `shared/menu.json`).
