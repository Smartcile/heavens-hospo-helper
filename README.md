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
   - `DB_PASSWORD` — a strong database password
   - `NEXTAUTH_SECRET` — `openssl rand -base64 32`
   - `WORKER_SESSION_SECRET` — `openssl rand -base64 32`
   - `APP_URL` — the **one** public URL you reach the app at, e.g.
     `http://192.168.1.100:9008` (LAN) or `https://hospo.example.com`
     (Cloudflare Tunnel). Drives both admin login and the QR codes.
   - `APP_PORT` — *(optional)* published host port, default `3000`
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
| Bar Manager | `bar@demo.com` | `bar1234` |
| Kitchen Manager | `kitchen@demo.com` | `kitchen1234` |
| FOH Manager | `foh@demo.com` | `foh1234` |

**Floor worker login (QR + PIN):** `0000` (admin) · `1111` (bar) · `2222` (kitchen) · `3333` (foh)

**Change these immediately in production.** Passwords are changed via **Settings** in the admin panel.

---

## HOW TO ACCESS THE ADMIN PANEL

1. Open `http://your-server-ip:3000/admin/login`
2. Enter your email and password
3. You will land on the Dashboard

The worker login (for QR scanning) is at `http://your-server-ip:3000/w/login`.

On a phone, the admin panel collapses to a **burger menu** (top-left) that slides
out the navigation; on desktop the sidebar is always visible.

---

## HOW IT ALL LINKS TOGETHER

HOSPO OPS is an **operational board**: one place that shows what's going on, with
the work and the knowledge that backs it linked together. The spine is:

```
Venue → Department → Section* → tasks + training/SOPs/FAQs → completion → follow-up
                                                                  (*planned layer)
```

- A **task** can be scoped venue-wide, to a department, to a section, or to one
  person. A staff member is linked to a task by *completing* it (tick / note /
  photo), which feeds the dashboard and the overdue tracker.
- Tasks and knowledge (SOPs, training, how-tos) bundle together per area so the
  guide is one tap from the task.
- Coming next: **sections** (bar / coffee / cabinet / floor under a department)
  and **follow-up triggers** — a missed or incorrectly-done task auto-assigns its
  training, and a task done by an untrained person prompts a manager to upskill.

**See it live:** open **Admin → Structure** (`/admin/structure`) for a tree of how
your venues, departments, staff, tasks and training are currently linked.

The full model and the build plan are documented in
[`ECOSYSTEM.md`](./ECOSYSTEM.md).

---

## HOW TO GENERATE AND PRINT A QR CODE

1. Go to **Admin → QR Codes**
2. Click **+ GENERATE QR CODE**
3. Select the venue and optionally a department
4. Enter a label (e.g. "BAR MORNING ENTRY")
5. Click **GENERATE**
6. Click **DOWNLOAD PNG** on the generated code
7. Print the PNG and display it at the entry point for that area

Workers scan the QR code with their phone camera — it opens the PIN login directly.

---

## HOW TO ADD STAFF AND ASSIGN PINs

1. Go to **Admin → Staff**
2. Click **+ NEW STAFF**
3. Fill in first name, last name, select a role, venue, and department
4. Enter a 2–4 digit PIN for the staff member
5. Click **SAVE**

The PIN is immediately usable at any QR code login point for that venue/department.

---

## ENVIRONMENT VARIABLE REFERENCE

These are the only variables you set (in Portainer's stack env, or in `.env`
for plain compose). Everything else is derived automatically.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_PASSWORD` | **Yes** | — | PostgreSQL password |
| `NEXTAUTH_SECRET` | **Yes** | — | Admin session signing secret (`openssl rand -base64 32`) |
| `WORKER_SESSION_SECRET` | **Yes** | — | Worker PIN session signing secret (`openssl rand -base64 32`) |
| `APP_URL` | **Yes** | — | The one public URL (incl. port if not 80/443). Drives admin login **and** QR codes |
| `APP_PORT` | No | `3000` | Host port the app is published on |
| `APP_NAME` | No | `HOSPO OPS` | Display / white-label name |
| `DB_USER` | No | `hospo_ops_user` | PostgreSQL username |
| `WORKER_SESSION_EXPIRY_MINUTES` | No | `15` | Worker auto-logout timeout |

> `DATABASE_URL` and `NEXTAUTH_URL` are **not** set by hand — the compose file
> builds `DATABASE_URL` from `DB_USER`/`DB_PASSWORD` and derives `NEXTAUTH_URL`
> from `APP_URL`. Uploads always go to the `uploads_data` volume.

---

## CLOUDFLARE ZERO TRUST / TUNNEL

If you expose the app through a Cloudflare Tunnel:

1. **Point the tunnel** at the app container — public hostname
   `hospo.example.com` → service `http://hospo-ops-app:3000` (or `http://<host-ip>:<APP_PORT>`).
2. **Set `APP_URL=https://hospo.example.com`** (no port). This makes admin login
   cookies and the QR codes all use the HTTPS hostname. With a tunnel you don't
   need to publish `APP_PORT` on the host at all.
3. **Cloudflare Access policies — exempt the worker paths.** Floor staff don't
   have Cloudflare accounts, so an Access policy covering the whole site will
   block them at the QR-code login. Add a **Bypass** (public) policy for:
   - `/w/*` — worker PIN login + task view
   - `/api/worker/*` — worker API
   - `/api/upload/*` — task photos

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
[Watchtower](https://containrrr.dev/watchtower/) at the `hospo-ops-app` container.)

---

## TROUBLESHOOTING

**No published port on the app container / can't reach the site.**
The container publishes port `3000`. Make sure you deployed *this* repo's
top-level `docker-compose.yml` (not a hand-pasted older copy). In Portainer use
**Stacks → Add stack → Repository** with compose path `docker-compose.yml`, so
you always get the current file with the `ports:` mapping. After deploy, the
`hospo-ops-app` container should show `0.0.0.0:3000->3000/tcp`. If you set
`APP_PORT`, it shows that host port instead.

**`unauthorized` when pulling the image.**
The GHCR package must be public (or add GHCR credentials in Portainer). See the
note under "With Docker" above.

**Admin login redirect loops or QR codes point to the wrong host.**
`NEXTAUTH_URL` and `APP_URL` must match the exact URL you open in the browser,
including the port. Fix them in the stack env and redeploy.

---

## BACKUP (POSTGRESQL DATA)

The PostgreSQL data is stored in a Docker volume (`postgres_data`). To back it up:

```bash
# Dump to a file
docker compose exec db pg_dump -U $DB_USER hospo_ops > backup-$(date +%Y%m%d).sql

# Restore from a file
docker compose exec -T db psql -U $DB_USER hospo_ops < backup-20240101.sql
```

Set up a cron job to run the dump command daily and copy it off-server.
