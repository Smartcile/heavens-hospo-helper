# HOSPO OPS

A self-hosted hospitality operations platform for venue managers and floor staff. Managers configure tasks and schedules via a web admin panel. Staff scan a printed QR code, enter their PIN, and complete their daily tasks on their phone.

---

## PREREQUISITES

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
- [Git](https://git-scm.com/)
- (Optional, for local dev) [Node.js 20+](https://nodejs.org/)

---

## INSTALL AND FIRST RUN

### With Docker (recommended)

The app image is built automatically by GitHub Actions and published to the
GitHub Container Registry (GHCR). You don't build anything yourself — Docker
just pulls the image. On first start, the container automatically runs database
migrations and seeds the demo data (safe to re-run on redeploys).

#### Option A — Portainer (Stacks → Add stack → Repository)

1. Repository URL: `https://github.com/Smartcile/heavens-hospo-helper`
2. Compose path: `docker-compose.yml`
3. Under **Environment variables**, set:
   - `INSTANCE_NAME` — a unique short name for this instance (e.g. `venue1`,
     `cbd-bar`). Container names become `venue1-app` / `venue1-db`. **Use
     a different name for each stack** — this is how you run multiple copies
     side-by-side without conflicts.
   - `DB_PASSWORD` — a strong database password
   - `NEXTAUTH_SECRET` — `openssl rand -base64 32`
   - `WORKER_SESSION_SECRET` — `openssl rand -base64 32`
   - `APP_URL` — the **one** public URL you reach the app at, e.g.
     `http://192.168.1.100:9008` (LAN) or `https://hospo.example.com`
     (Cloudflare Tunnel). Drives both admin login and the QR codes.
   - `APP_PORT` — *(important for multi-instance)* published host port, default `3000`.
     Each stack must have a unique host port (e.g. `9001`, `9002`).
4. Click **Deploy the stack**.

#### Option B — plain docker compose

```bash
# 1. Clone the repo
git clone https://github.com/Smartcile/heavens-hospo-helper.git
cd heavens-hospo-helper

# 2. Create your environment file
cp .env.example .env
# Edit .env and fill in the required secrets/URLs

# 3. Pull the prebuilt image and start
docker compose pull
docker compose up -d
```

The app will be available at `http://your-server:3000`. Migrations and seeding
happen automatically inside the container on startup.

> **Note on the GHCR image:** the package is private by default. For Portainer
> to pull it without credentials, open the package on GitHub
> (**Profile → Packages → heavens-hospo-helper**) → **Package settings** →
> **Change visibility → Public**. Alternatively, add your GHCR registry
> credentials to Portainer (**Registries → Add registry → Custom**, using a
> GitHub personal access token with `read:packages`).

### Local development (no Docker)

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp apps/web/.env.local.example apps/web/.env.local
# Edit .env.local — point DATABASE_URL to your local Postgres

# 3. Run migrations and seed
cd packages/db
npx prisma migrate dev
npm run db:seed

# 4. Start dev server
cd ../..
npm run dev
```

App runs at `http://localhost:3000`.

---

## DEFAULT CREDENTIALS

After seeding, the following accounts exist.

**Admin / manager web login (email + password):**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@demo.com` | `admin1234` |
| BOH Manager (demo) | `boh@demo.com` | `boh1234` |
| FOH Manager (demo) | `foh@demo.com` | `foh1234` |

> **The admin account is the bootstrap login for every install.** The BOH/FOH
> manager accounts live in the seeded **demo venue** (see below). Re-deploying
> never resets credentials — once you change the admin password it stays.

**Floor worker login (QR + PIN):** `0000` (admin) · `1111` (manager) · `1234` (BOH staff) · `2345` (BOH staff) · `3456` (FOH staff) · `4567` (FOH staff)

**Change these immediately in production.** Passwords and PINs are changed via **Settings** in the admin panel.

### Demo venue

The seed creates a **DEMO VENUE — AUCKLAND** — a full sample venue with departments, staff,
tasks, checklists, and training modules. On a fresh install it is **enabled** so you can
evaluate the app immediately. On an existing install with real venues it is created **disabled**.

- **Disable/enable** in **Settings → DEMO VENUE** (admin only). When disabled the demo
  venue is hidden from worker login, admin venue lists, and dashboards.
- **Read-only for managers**: demo-venue managers can use the venue (tick tasks, complete
  stocktakes) but all configuration edits (tasks, checklists, staff, training, settings)
  are blocked. Only an **ADMIN**-role login can edit demo data.
- **Isolated from syncs**: the demo venue is excluded from WooCommerce product/order sync,
  calendar imports, webhooks, and expiry scans.
- **Legacy cleanup**: on redeploy, the seed automatically cleans up demo data from any
  non-demo venue (a prior design placed demo data into the first venue).

### Venue sharing

Venues can opt into sharing via **Settings → VENUE SHARING**. When enabled:

- **Staff** can be assigned to multiple venues (**Staff → Edit → SHARED VENUES**). Workers
  can then clock in at any assigned venue. Multi-venue managers see a venue dropdown in the
  sidebar instead of a single-venue label.
- **Products (menu items)** can be shared to other venues with optional per-venue price
  overrides. Shared items appear with a blue `(SHARED FROM X)` badge on the **Menu Items** page.
- **WooCommerce** uses a **source-venue model** — one venue connects to WooCommerce, other
  venues pull products and orders through it by setting a **WooCommerce Source Venue** in
  Settings. The sync dashboard, webhooks, and push all route through the source venue.

### Department linking

Departments can be linked to share tasks and checklists. **Admin → Venues → DEPARTMENTS → EDIT**
on any department — search and add other departments in the **LINKED DEPARTMENTS** section.
Linked departments appear as blue badges in the department list and structure tree.

When departments are linked, staff in one department see tasks and checklists from all
linked departments alongside their own. Linked-department tasks show up in both the worker
task list and the admin Tasks page.

---

## HOW TO ACCESS THE ADMIN PANEL

1. Open `http://your-server-ip:3000/` — the landing page is a split screen
2. Enter your email and password in the **ADMIN PANEL** area on the right
3. You will land on the Dashboard

The worker login (for QR scanning) is the **VENUE** side of the landing page, or
directly at `http://your-server-ip:3000/w/login`. The worker venue picker also
has an **ADMIN PANEL** button that returns to the landing page.

On a phone, the admin panel collapses to a **burger menu** (top-left) that slides
out the navigation; on desktop the sidebar is always visible.

---

## HOW IT ALL LINKS TOGETHER

HOSPO OPS is an **operational board**: one place that shows what's going on, with
the work and the knowledge that backs it linked together. The spine is:

```
Venue → Department → Section → tasks + training/SOPs/FAQs → completion → follow-up
```

- A **task** can be scoped venue-wide, to a department, to a section, or to one
  person. A staff member is linked to a task by *completing* it (tick / note /
  photo), which feeds the dashboard and the overdue tracker.
- Tasks and knowledge (SOPs, training, how-tos) bundle together per area so the
  guide is one tap from the task.
- **Sections** (bar / coffee / cabinet / floor under a department) and **follow-up
  triggers** are built: a missed or incorrectly-done task auto-assigns its training,
  and a task done by an untrained person prompts a manager to upskill
  (`/admin/execution?tab=followups`).

**See it live:** open **Admin → Setup & Config → Settings → STRUCTURE**
(`/admin/settings?tab=structure`). The **TREE** tab shows a collapsible tree of how
your venues, departments, staff, tasks and training are linked; the **MAP** tab is an
interactive link graph for mapping out workflows — click any node to trace how lists
talk to tasks and training/SOP.

The full model and the build plan are documented in
[`ECOSYSTEM.md`](./ECOSYSTEM.md).

### FLOOR PLANNER

The floor planner is a full inventory-aware spatial planning engine built on PixiJS v7.
Go to **Admin → Floor Plan** to create a to-scale venue layout with walls, fixtures, and
permanent structures (the base plan). Features: zoom/pan, multi-select, zone drawing,
per-corner rounding, bracket chairs, section assignment, capacities, undo/redo, PDF export.

**Layered Setups:** Once a base plan exists, use the SETUP dropdown to create event-specific
furniture layouts (e.g. "WEDDING RECEPTION", "CONFERENCE"). Each setup can have its own table
arrangement, saved independently from the base plan. Switch between setups in the toolbar.

**Table Profiles & BOM:** Define table types at **Admin → OPS HUB → INVENTORY & STOCKTAKE → INVENTORY → TABLES**. Each profile has
dimensions, colour, seat count, seating density (cm per chair), head chair caps, and a Bill of
Materials (BOM) — linking to inventory items with per-chair or per-table quantities. Physical
table numbers (e.g. "20", "21") are managed via tag input and auto-assigned on placement.

**Two-layer editing:** The base plan (walls, fixtures, section zones) and the movable tables
live on separate layers. Pick a setup from the SETUP dropdown and the base plan **dims and
locks** so you only move furniture. Deselect the setup to edit the base plan again.
Rubber-band lasso selection works across the canvas.

**Direct-manipulation tables:** Tables are created and managed from the **inventory module**
(`/admin/ops?tab=inventory&sub=inventory` → TABLES category). Select a table on the canvas to **rotate via a drag
handle** (or the preset angle buttons) and set chairs by **clicking the table's edges** —
left-click adds a chair to that side, right-click removes one, up to the profile's capacity
and head-of-table caps. Delete key or the panel button removes tables.

**Auto-join (banquet joinery):** Drag two same-profile tables flush together and they **snap
and join automatically** into one banquet block (or use the GROUP button). A joined block moves
as a unit, renders as a single outline, and its chairs redistribute **evenly around the exposed
perimeter**, respecting head-of-table constraints (no cramming chairs on short sides).

**Live per-area totals:** Each section zone shows a running `N TBL · M PAX` badge, and the setup
toolbar shows the grand total — both update as you drag tables in and out. A table auto-tags to
the zone its centre lands in.

**Inventory Check:** The right panel INVENTORY CHECK runs `calculateSetupInventory` for the
active setup — comparing required items (from each profile's BOM) against total venue stock and
showing shortages in red.

**Worker View:** Staff see floor plans at **Menu → Floor Plan** with a read-only PixiJS
canvas. A setup switcher dropdown (alongside the view switcher) lets them switch between
event layouts. Assigned table numbers display as labels. Calendar events can link to setups.

**API:** routes for TableProfile CRUD, FloorPlanSetup CRUD, SetupItem bulk save, TableGroup
management, SectionBoundary CRUD, and worker setup views.

### BUDGET SPLITTER

The app includes a weighted, multi-category monthly budget tool. Go to **Admin → Performance → Budget**

**Landing page** (`/admin/budget`) shows a 12-month grid — click any month to open its
full editor at `/admin/budget/[year]/[month]`.

**Setup**: Enter a **Total Budget ($)** for the month. The **REVENUE** category is
pre-filled at 100% of the total. Add breakdowns (e.g. BEVERAGE 21%, FOOD 30%) under
REVENUE — each links to a department (or `VENUE` for venue-wide expenses like admin/rent).
A read-only **REMAINDER** row auto-computes the unallocated percentage. Breakdowns are
department-level splits of the daily revenue, not peers of the total.

**Daily Weighting**: Set a MON-SUN percentage profile (must sum to 100%) — e.g. FRI=25%,
SAT=25%, MON=5%. This drives how the monthly REVENUE distributes across working days.

Click **GENERATE GRID** to compute the daily allocations. The grid shows weeks as card
boxes with each day's REVENUE amount (editable) and an inline breakdown of department
splits (read-only). The **SUMMARY** panel in the setup area shows live TARGET / ALLOCATED
/ VARAINCE stats that update as you edit days.

**Sync breakdowns** across months: set up categories once, click **↻ SYNC BREAKDOWNS**
to copy them to all months in the venue. Percentages sync too. When browsing to a month
without a budget, the API auto-copies breakdowns from the most recent period that has them.

All amounts are rounded to the nearest $500. The math engine normalises weekday weights
against actual working days and applies post-rounding correction so the total never falls
below budget.


The app includes a full inventory management system. Go to **Admin → OPS HUB → INVENTORY & STOCKTAKE** to create
categories (7 built-in + custom per venue) and items with par levels. Furniture items are
linked to Table Profiles via BOM (Bill of Materials) — each table type defines which
inventory items it requires and in what quantities (defined in the INVENTORY tab's TABLES
category). **Admin → OPS HUB → INVENTORY & STOCKTAKE → STOCKTAKE** creates stock counts,
assigns them to a role or staff member, and tracks variance on sign-off. Staff complete
stocktakes on their phone at **Menu → Stocktake** with a scrollable count list. The dashboard
shows par level alerts for items below threshold. The **STOCK** tab in the inventory page
shows a hierarchy tree (Section → Table → Inventory Items).

### UNITS OF MEASURE — VOLUME ↔ WEIGHT ↔ COUNT

Every unit of measure knows its dimension (**VOLUME** / **MASS** / **COUNT**) and converts
to a canonical base (mL / g / ea) — CUP = 250 mL, TABLESPOON = 20 mL, TEASPOON = 5 mL,
OUNCE = 28.35 g, POUND = 453.6 g and so on. An ingredient can carry a **density**
(grams per mL) and a **per-unit weight** (1 egg ≈ 50 g), so the software can answer
*"how many grams is 1 cup of flour?"* — per ingredient, not per unit (1 cup flour ≈ 132 g,
1 cup sugar ≈ 211 g).

**Setting it up is easy:**
- **Admin → OPS HUB → INVENTORY & STOCKTAKE → edit an item → DENSITY** box: type a density (G/ML), or the friendlier
  **"1 CUP = ___ G"** (e.g. 132) and the g/mL is computed for you, or **1 UNIT = ___ G**.
- Typing a name auto-suggests the built-in library (86 known ingredients — FLOUR - 00,
  FLOUR - SELF RAISING, sugars, dairy, oils, produce...): click **APPLY DENSITY?** and it
  fills itself. **FROM LIBRARY** opens the searchable list; venues can save their own
  items as references.
- **HELP ME FIND OUT** opens a copy-paste prompt customised for the item — paste it into
  any LLM, paste the answer back, and the density is filled in automatically.

**On the Recipes page** (**Admin → OPS HUB → MENU & SERVICES → RECIPES**) the INGREDIENTS list has a **VOLUME / WEIGHT** switch — flip to
WEIGHT and every line shows its gram equivalent (e.g. "×2 CUP · ≈ 264 G"). Changing a
line's unit auto-converts the quantity, so the recipe stays the same physically. Recipe
explosions (inventory deduction) now sum in grams whenever the item has density data,
so a recipe using both 1 CUP and 500 G of the same item adds correctly.

### STAFF CLOCKS, ROSTER & NZ PAYROLL

Three **Roster & Pay** pages (**Admin → Team & Execution → Roster & Pay**) cover the
staff-cost workflow end to end:

**Staff Clocks** (`/admin/team?tab=clocks`) — a per-day table of every clock-in/out session:
TEAM MEMBER, ROLE, WHEN IN/OUT, BREAKS, TIME WORKED and RATE. Sessions arrive as
**PENDING** and are **APPROVED / REJECTED** by a manager; only APPROVED, closed
sessions count toward payroll. SHOW DELETED CLOCKS, VIEW EDITS (audit trail of every
change), + ADD CLOCK for manual entries, and the same date navigation as Orders.

**Roster Editor** (`/admin/team?tab=roster`) — a staff × 7-day grid of coloured shift blocks
(time range + role/tag). DAY/WEEK view, filter by role, search, `< TODAY >` navigation,
PRINT (A4 PDF), fullscreen, and a PUBLISH/DRAFT status — workers only see **PUBLISHED**
shifts on their phone. The footer shows TOTAL COST, BUDGETED SALES (from the Budget
module's daily REVENUE allocations), STAFFING RATIO and TOTAL PAID HOURS; ANALYZE and
VISUALIZE open per-role and per-day breakdowns. Approved time-off requests visibly
block day cells so nobody gets rostered onto their day off.

**Payroll** (`/admin/team?tab=payroll`) — create pay periods (weekly / fortnightly / monthly),
then **CLOSE PERIOD** runs the built-in NZ statutory engine over approved clocks:
PAYE income tax (progressive brackets, tax-code aware M/S/SB/SH/ST/CAE + student loan
variants), ACC earner levy, KiwiSaver (employee 3–10% + employer contribution), student
loan repayments, **8% holiday pay for casuals** (paid out each period) vs **annual leave
accrual** for permanent staff, **public holidays at 1.5× with an alternative day
(day-in-lieu) ledger**, a minimum-wage floor, and optional contractual overtime.
Per-staff PAYSLIP breakdowns, CSV export, a seeded national public-holiday list
(editable per venue), and a SETTINGS tab — all statutory rates are configurable because
they change annually.

**Workers** clock in/out and take BREAK/BACK breaks from their phone; clocked break
minutes deduct from paid time, and the payroll engine splits them into paid rest
(10-min) vs unpaid meal (30-min) breaks per NZ entitlement.

---

## HOW TO GENERATE AND PRINT A QR CODE

1. Go to **Admin → Setup & Config → Settings → QR CODES**
2. Click **+ GENERATE QR CODE**
3. Select the venue and optionally a department
4. Enter a label (e.g. "BAR MORNING ENTRY")
5. Click **GENERATE**
6. Click **DOWNLOAD PNG** on the generated code
7. Print the PNG and display it at the entry point for that area

Workers scan the QR code with their phone camera — it opens the PIN login directly.

---

## HOW TO ADD STAFF AND ASSIGN PINs

1. Go to **Admin → Team & Execution → Roster & Pay → STAFF**
2. Click **+ NEW STAFF**
3. Fill in first name, last name, select a role, venue, and department
4. Enter a 2–4 digit PIN for the staff member
5. Set the **hourly rate** and **employment type** (FULL TIME / PART TIME / CASUAL —
   casuals get 8% holiday pay paid out per payroll period)
6. Under **NZ PAYROLL** set the tax code (M by default — S/SB/SH/ST/CAE for second
   jobs, add "SL" for student loan), KiwiSaver rate (3–10%, or leave unenrolled),
   and tick STUDENT LOAN if repayments should be withheld
7. Click **SAVE**

The PIN is immediately usable at any QR code login point for that venue/department.
Set the venue's payroll defaults (minimum wage, ACC, tax code, overtime…) at
**Admin → Team & Execution → Roster & Pay → PAYROLL → SETTINGS**.

---

## ENVIRONMENT VARIABLE REFERENCE

These are the only variables you set (in Portainer's stack env, or in `.env`
for plain compose). Everything else is derived automatically.

| Variable | Required | Default | Description |
|---|---|---|---|
| `INSTANCE_NAME` | **Yes** | `hospo-ops` | Unique name for this instance. Drives container names (`{name}-app`, `{name}-db`). Use a different value per stack for multi-instance deploys |
| `DB_PASSWORD` | **Yes** | — | PostgreSQL password |
| `NEXTAUTH_SECRET` | **Yes** | — | Admin session signing secret (`openssl rand -base64 32`) |
| `WORKER_SESSION_SECRET` | **Yes** | — | Worker PIN session signing secret (`openssl rand -base64 32`) |
| `APP_URL` | **Yes** | — | The one public URL (incl. port if not 80/443). Drives admin login **and** QR codes |
| `APP_PORT` | No | `3000` | Host port the app is published on. **Must be unique per stack** for multi-instance deploys |
| `APP_NAME` | No | `HOSPO OPS` | Display / white-label name |
| `DB_USER` | No | `hospo_ops_user` | PostgreSQL username |
| `DB_DATA` | No | `postgres_data` | Where PostgreSQL stores its data. Default is a named Docker volume (auto-scoped per stack). Set to a host path (e.g. `/mnt/data/db`) for a bind mount |
| `UPLOADS_DATA` | No | `uploads_data` | Where task photos / uploads are stored. Default is a named Docker volume (auto-scoped per stack). Set to a host path (e.g. `/mnt/data/uploads`) for a bind mount |
| `WORKER_SESSION_EXPIRY_MINUTES` | No | `15` | Worker auto-logout timeout |
| `INTERNAL_CRON` | No | `true` | Built-in scheduler (WooCommerce product sync every 15 min + daily expiry scan). Set `false` to use an external scheduler instead |
| `CRON_SECRET` | No | — | Bearer token for the `/api/cron/*` endpoints — only needed for external schedulers or manual triggers |

> `DATABASE_URL` and `NEXTAUTH_URL` are **not** set by hand — the compose file
> builds `DATABASE_URL` from `DB_USER`/`DB_PASSWORD` and derives `NEXTAUTH_URL`
> from `APP_URL`. Uploads and database storage use `UPLOADS_DATA` / `DB_DATA`
> (named volumes by default, or host paths for bind mounts).

---

## WOOCOMMERCE SYNC (OPTIONAL)

HOSPO OPS syncs two-way with a WooCommerce store — orders and products flow in
via webhooks (instant) and a built-in REST API pull (product + order, every 15 min),
product/order-status changes push back automatically. **No host crontab
or OS access is needed**, so this works the same on Portainer, plain compose,
or any managed container platform.

- Setup guide: [`SOP-WOOCOMMERCE.md`](SOP-WOOCOMMERCE.md)
- Live sync monitor: **Admin → Setup & Config → Settings → SYNC** (`/admin/settings?tab=sync`) — every pull, push,
  and webhook is logged there with errors in red, plus manual PULL PRODUCTS / PULL ORDERS / PUSH buttons.
- Order field mapping: **Admin → Settings → WooCommerce → ORDER FIELD MAPPING** —
  tells HOSPO OPS which WooCommerce custom fields hold the service date, time slot,
  party size and allergy note. Needed before the Orders page can group by day.
- Kitchen view: workers access **Menu → KITCHEN** (`/w/kitchen`) for today's orders
  grouped by table with dietary badges.

### Orders

**Admin → OPS HUB → ORDERS** is a day view with four ways of reading the same data,
switchable on the fly:

| View | Shows |
|------|-------|
| SERVICE | Orders by time slot, with covers per slot |
| KITCHEN | Allergy alerts first, then dish totals and a category rollup |
| FOH | Grouped by table |
| PRODUCTION | Flat pick list with tick boxes |

Filter by progress, payment or allergy and save the combination as a named view.
Orders can be raised by hand (**+ NEW ORDER**) for phone and walk-in business —
these stay local and are never pushed to WooCommerce.

**Payments are always taken in WooCommerce.** HOSPO OPS records what was paid,
how, and when, but never handles money itself.

**Admin → OPS HUB → MENU & SERVICES → MENUS & CATEGORIES** defines what can be ordered — e.g. a Friday Night Bistro menu
and an Event Catering menu, each with a guest-count range and per-item minimum
and maximum quantities.

---

## CLOUDFLARE ZERO TRUST / TUNNEL

If you expose the app through a Cloudflare Tunnel:

1. **Point the tunnel** at the app container — public hostname
   `hospo.example.com` → service `http://<instance>-app:3000`, where `<instance>`
   is your `INSTANCE_NAME` (default `hospo-ops`). Or point it at `http://<host-ip>:<APP_PORT>`.
2. **Set `APP_URL=https://hospo.example.com`** (no port). This makes admin login
   cookies and the QR codes all use the HTTPS hostname. With a tunnel you don't
   need to publish `APP_PORT` on the host at all.
3. **Cloudflare Access policies — exempt the worker paths.** Floor staff don't
   have Cloudflare accounts, so an Access policy covering the whole site will
   block them at the QR-code login. Add a **Bypass** (public) policy for:
   - `/w/*` — worker PIN login + task view
   - `/api/worker/*` — worker API
   - `/api/upload/*` — task photos
   - `/api/webhooks/*` — WooCommerce webhooks (HMAC-verified by the app itself)
   - `/api/cron/*` — only if you use an external scheduler (bearer-token protected)

   Keep `/admin/*` and `/api/admin/*` behind Access for an extra auth layer if
   you like — the app still requires its own admin login on top.

> **Note on HTTP vs HTTPS cookies:** over HTTPS (Cloudflare) everything works.
> If you *also* browse via plain `http://<lan-ip>:<port>`, the secure session
> cookies won't be sent and login will appear to loop — pick the HTTPS hostname
> as your primary `APP_URL` and use that consistently.

---

## HOW TO UPDATE

The image rebuilds automatically on GitHub whenever code is pushed. To pull the
new image onto your server:

**Portainer:** open the stack → **Update the stack** → tick **Re-pull image and
redeploy** → **Update**.

**Plain compose:**

```bash
cd heavens-hospo-helper
docker compose pull      # fetch the latest image from GHCR
docker compose up -d     # recreate the app container
```

Database migrations run automatically inside the container on every start, so
schema changes are applied for you. (To auto-update without clicking, point
[Watchtower](https://containrrr.dev/watchtower/) at the `<instance>-app` container.)

---

## TROUBLESHOOTING

**No published port on the app container / can't reach the site.**
The container publishes port `3000`. Make sure you deployed *this* repo's
top-level `docker-compose.yml` (not a hand-pasted older copy). In Portainer use
**Stacks → Add stack → Repository** with compose path `docker-compose.yml`, so
you always get the current file with the `ports:` mapping. After deploy, the
`<instance>-app` container should show `0.0.0.0:3000->3000/tcp`. If you set
`APP_PORT`, it shows that host port instead.

**`unauthorized` when pulling the image.**
The GHCR package must be public (or add GHCR credentials in Portainer). See the
note under "With Docker" above.

**Admin login redirect loops or QR codes point to the wrong host.**
`NEXTAUTH_URL` and `APP_URL` must match the exact URL you open in the browser,
including the port. Fix them in the stack env and redeploy.

---

## BACKUP (POSTGRESQL DATA)

The PostgreSQL data is stored in a Docker volume or bind mount (controlled by
`DB_DATA` — default named volume `postgres_data`, or a host path). To back it up:

```bash
# Dump to a file
docker compose exec db pg_dump -U $DB_USER hospo_ops > backup-$(date +%Y%m%d).sql

# Restore from a file
docker compose exec -T db psql -U $DB_USER hospo_ops < backup-20240101.sql
```

Set up a cron job to run the dump command daily and copy it off-server.
