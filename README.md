# BurChips × Bake Dukan — Online Ordering

Online ordering website for **BurChips** (burgers, grilled chicken, wraps) and **Bake Dukan** (desserts),
DHA Phase 8, Lahore.

| Part | Tech |
|---|---|
| Frontend (`/web`) | React 19, Vite, TypeScript, Tailwind CSS v4 |
| Backend (`/api/BurChips.Api`) | ASP.NET Core 10, EF Core 10, ASP.NET Core Identity |
| Database | SQL Server (LocalDB in development, Azure SQL in production) |
| Hosting | One Azure App Service serves the API **and** the built React app (`wwwroot`) |

The full project plan (decisions, architecture, roadmap) lives with the project owner;
this README covers running the code.

## Prerequisites

- .NET SDK 10
- Node.js 22+ and npm
- SQL Server LocalDB (ships with Visual Studio / SQL Server Express)

## First-time setup

```bash
# 1. Restore the local EF Core CLI
dotnet tool restore

# 2. Set the development owner login (stored in user-secrets, never in git)
cd api/BurChips.Api
dotnet user-secrets set "Seed:OwnerEmail" "owner@burchips.local"
dotnet user-secrets set "Seed:OwnerPassword" "<at least 10 characters>"
dotnet user-secrets set "Otp:Secret" "<random string, 32+ characters>"   # e.g. openssl rand -hex 32
cd ../..

# 3. Install frontend packages
cd web && npm install && cd ..
```

## Running locally

Two terminals:

```bash
# Terminal 1 — API on http://localhost:5122
# Creates/migrates the BurChips LocalDB database and seeds the menu on first start.
cd api/BurChips.Api
dotnet run --launch-profile http

# Terminal 2 — React dev server on http://localhost:5173 (proxies /api and /hubs to the API)
cd web
npm run dev
```

In development no SMS is sent: the phone-sign-in screen shows the 6-digit code on screen
(and the API logs it). Production needs a real SMS provider (`Sms:Provider`) — until one is
configured, code requests return "please call us" instead of failing silently.

To test the production-style setup (API serving the built React app), run `npm run build` in `/web`
and open http://localhost:5122.

### Admin panel

Open `/admin` and sign in with the owner email/password from user-secrets.
On the counter tablet, press **Start shift** once: browsers only allow sound after a tap, and it also
keeps the screen awake. New orders then ring until someone accepts or rejects them.

| Role | Can do |
|---|---|
| Owner | Everything: menu, prices, photos, options, delivery areas, promo codes, settings & hours, staff, reports |
| Staff | Live orders (accept → prepare → out/ready → complete, reject with reason), order history, sold-out switches, pause online orders |

Every admin change needs the anti-forgery token (`X-XSRF-TOKEN`), which the admin app fetches
after sign-in. Menu photos are stored in `App_Data/uploads` locally and in Azure Blob Storage in production
(`Images:Provider = AzureBlob`).

New-order alerts go to the owner's WhatsApp through Meta's WhatsApp Cloud API (`WhatsApp:*` settings,
with a pre-approved utility template taking 4 parameters: order number, total, delivery/pick-up, items).
If WhatsApp fails, an SMS goes to the store's WhatsApp number. Without WhatsApp settings, alerts are only logged.

## Tests

```bash
# API: unit tests + integration tests (uses a temporary LocalDB database, dropped afterwards)
dotnet test BurChips.slnx

# Frontend: lint + unit tests
cd web && npm run lint && npm test

# End-to-end in the locally installed Microsoft Edge (phone + desktop sizes).
# Build first; Playwright starts the API automatically if it isn't already running.
# Admin tests also need the dev owner login (skipped without it):
#   E2E_OWNER_EMAIL=... E2E_OWNER_PASSWORD=... npm run e2e
cd web && npm run build && npm run e2e
```

Checkout and admin order tests are skipped automatically while the shop is closed
(outside opening hours), because orders can't be placed then.

## Deployment

Azure resources are defined in `infra/main.bicep`; step-by-step setup (resources, GitHub auto-deploy,
custom domain, settings) is in **[infra/README.md](infra/README.md)**. The owner's go-live steps are in
**[LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md)**.

Production behaviour worth knowing:

- `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` is required behind Azure's HTTPS front end (set by the Bicep template);
  without it the app sees plain http and refuses staff security tokens.
- Database migrations run on app start (`Database__MigrateOnStartup=true`) — fine for a single App Service instance.
- Sign-in/anti-forgery encryption keys are stored in the database (`DataProtectionKeys` table), so restarts don't sign anyone out.
- Security headers (CSP, frame/sniff/referrer protections) are set by `Features/Platform/WebHosting.cs`.
- Built files in `/assets` are cached for a year (hashed names); pages are never cached, so deploys show immediately.
- `/robots.txt` and `/sitemap.xml` use the domain the site is served from; link-preview tags in `index.html`
  use `__ORIGIN__`, which the server replaces on each page request.

## CI/CD

`.github/workflows/deploy.yml` runs on every push and pull request: frontend lint + unit tests + build,
then all API tests against a SQL Server container, then publishes. Pushes to `main` deploy to Azure and
check `/api/health`. Browser (Playwright) tests are run locally before releases.

## Database

- Migrations live in `api/BurChips.Api/Data/Migrations`.
- Add a migration after changing entities:
  `dotnet ef migrations add <Name> --project api/BurChips.Api --output-dir Data/Migrations`
- In development the API applies migrations on start (`Database:MigrateOnStartup`).
  In production they are applied by the deploy pipeline.
- `Data/Seed/DbSeeder.cs` fills an **empty** database only: roles, owner account, store settings,
  opening hours and the menu from `Data/Seed/MenuSeed.cs`. It never overwrites existing data,
  so after launch the owner manages everything from the admin panel.

### Starting menu photos

Every menu item starts with a stock photo from `api/BurChips.Api/Data/Seed/Images/{slug}.webp`
(800×600 WebP). All are CC0 or public-domain images found through Openverse (mostly the WordPress Photo
Directory). They're free for commercial use with no attribution required; sources are listed in `credits.json`.
They show generic food, not the shop's actual dishes, so replace them with real photos in **Admin → Menu** when ready.

On first start the seeder uploads them to the configured photo storage (local folder or Azure Blob) for items
without a photo, then sets `StoreSettings.DemoImagesApplied`, so removed or replaced photos are never re-added.
Disable with `Seed:DemoImages=false`.

### Placeholder data to replace before launch

| Data | Placeholder | Where to change (once admin exists) |
|---|---|---|
| Opening hours | 12:00 PM – 2:00 AM every day | Admin → Settings & hours |
| Delivery areas | 5 sample DHA/Askari areas with sample fees (development only) | Admin → Delivery areas |

## Project layout

```
api/BurChips.Api/
  Data/Entities/       Menu, store, customer, order and staff entities
  Data/AppDbContext.cs EF Core model (indexes, delete rules, order-number sequence)
  Data/Seed/           Menu seed + startup seeder
  Features/Menu/       GET /api/menu — public menu with option rules
  Features/Store/      GET /api/store — contact, hours, delivery areas, open/closed status
  Features/Customers/  Phone sign-in (SMS code, hashed + rate-limited), Turnstile bot check, /api/me
  Features/Checkout/   PricingService — the single source of truth for every total
  Features/Orders/     Quote, place (COD), my orders, order details, status rules, notifications
  Features/Admin/      Staff sign-in + anti-forgery, live orders/history/status, menu & photo manager,
                       areas, promos, settings & hours, pause, staff accounts, sales report
  Features/Platform/   Security headers, caching, robots/sitemap, page fallback with site address
  Features/Notifications/ SMS sender, owner WhatsApp alerts (background queue, SMS fallback)
  Hubs/                SignalR: customer order tracking + staff live board
  Program.cs           DI, auth (staff + customer cookies), rate limits, admin routes, React hosting
api/BurChips.Api.Tests/ xUnit unit + integration tests
infra/                 Azure Bicep template + deployment guide
.github/workflows/      Build, test & deploy pipeline
web/
  src/pages/           Home, Menu, Find us, Checkout, Order tracking, My orders, policies, 404
  src/features/account Phone sign-in + Turnstile widget
  src/features/orders  Status labels/steps, live updates over SignalR
  src/features/menu/   Item cards, item dialog (options/meal/sauces), placeholder art
  src/features/cart/   Cart store (saved in the browser), cart drawer, live price check
  src/lib/             API types, display pricing (mirrors the server), hours formatting
  src/admin/           Admin panel (separate lazy-loaded bundle): live board + bell, history, menu,
                       options, areas, promos, settings, staff, reports
  e2e/                 Playwright end-to-end tests
```

## Roadmap

- [x] **Phase 0** — solution, database schema, menu seed, owner/staff roles, brand theme
- [x] **Phase 1** — customer site (home, menu, item options, cart, open/closed banner, find us)
- [x] **Phase 2** — checkout (phone OTP, delivery areas, promo codes, COD), live order tracking, my orders
- [x] **Phase 3** — admin (live orders with bell + WhatsApp alerts, menu & photo manager, options, areas, promos, hours, staff, reports)
- [ ] Phase 4 — PayFast online payments
- [x] **Phase 5** — legal pages, SEO & link previews, security headers, caching, Azure (Bicep) + GitHub Actions, launch checklist
