# Standard Operating Procedure: WooCommerce Integration Setup

---

## How the sync works (overview)

| Flow | Mechanism | Speed |
|------|-----------|-------|
| Orders (Woo → HOSPO OPS) | Webhook | Instant |
| Products (Woo → HOSPO OPS) | Webhooks + built-in 15-minute pull | Instant / 15 min worst case |
| Products (HOSPO OPS → Woo) | Automatic push on save + manual PUSH button | Instant |
| Order status (HOSPO OPS → Woo) | Automatic push on status change | Instant |

Every sync event (in both directions) is recorded on the **SYNC dashboard**
(**HOSPO OPS → Woo Sync**), including errors — use it to watch the integration
live while testing.

The scheduler is **built into the app container** — there is nothing to
configure on the host machine, so this works on any Docker host or managed
platform (Portainer, Railway, Render, Fly.io, etc.).

> **Already running an older version?** See
> [Updating an Existing Deployment](#updating-an-existing-deployment-pre-two-way-sync-versions)
> below — the upgrade is a re-pull plus three new webhooks.

---

## Phase 1: WordPress / WooCommerce Prep

1. Log into **WordPress Admin** (`/wp-admin`).
2. Navigate to **WooCommerce → Settings → Advanced → REST API**.
3. Click **Add Key**.
   - **Description:** `HOSPO OPS`
   - **User:** Select an admin-level user.
   - **Permissions:** `Read/Write`
4. Click **Generate API Key**.
5. Copy the **Consumer Key** and **Consumer Secret**. Keep this tab open.

> **Note:** `Read/Write` permissions are required — HOSPO OPS pushes product
> and order-status changes back to WooCommerce.

---

## Phase 2: HOSPO OPS Configuration

1. Log into the **HOSPO OPS Admin** dashboard.
2. Navigate to **Settings** (sidebar under the Settings group).
3. Scroll to the **WOOCOMMERCE** section.
4. Enter the following fields:

   | Field | Source | Example |
   |-------|--------|---------|
   | **STORE URL** | Your WordPress site URL | `https://mybar.co.nz` |
   | **CONSUMER KEY** | From Phase 1, Step 5 | `ck_...` |
   | **CONSUMER SECRET** | From Phase 1, Step 5 | `cs_...` |
   | **WEBHOOK SECRET** | Generate a new random string (password manager recommended) | `whsec_abc123...` |

5. Toggle the button to **ACTIVE**.
6. Click **SAVE WOOCOMMERCE**.

---

## Phase 3: Webhook Handshake (WooCommerce → HOSPO OPS)

Create the following webhooks in **WordPress Admin → WooCommerce → Settings →
Advanced → Webhooks → Add Webhook**. All of them share the same settings:

- **Status:** `Active`
- **Delivery URL:** `https://<your-app-domain>/api/webhooks/woocommerce`
- **Secret:** Paste the exact **Webhook Secret** you generated in Phase 2, Step 4.
- **API Version:** `WP REST API Integration v3`

| # | Name | Topic | Purpose |
|---|------|-------|---------|
| 1 | `HOSPO OPS Order Sync` | `Order updated` | Instant order sync (fires on creation and updates) |
| 2 | `HOSPO OPS Product Created` | `Product created` | Instant product import |
| 3 | `HOSPO OPS Product Updated` | `Product updated` | Instant product changes |
| 4 | `HOSPO OPS Product Deleted` | `Product deleted` | Removes the linked menu item |

> **Note:** The product webhooks give you near-instant product sync. Even if a
> webhook delivery fails, the built-in 15-minute product pull catches up
> automatically.

---

## Phase 4: Scheduling (built-in — nothing to do)

The app container runs its own internal scheduler:

- **Product pull** — every 15 minutes (backstop for the product webhooks)
- **Expiry scan** — daily at 03:00 (`DEFAULT_TIMEZONE`, default Pacific/Auckland)

No host crontab, no external scheduler, no OS access required. This works
out-of-the-box on any Docker deployment.

### Optional: use an external scheduler instead

If you prefer to control scheduling externally (Linux crontab, AWS
EventBridge, etc.):

1. Set `INTERNAL_CRON=false` in your deployment env.
2. Set a `CRON_SECRET` (generate with `openssl rand -base64 32`).
3. Schedule GET requests with an `Authorization: Bearer <YOUR_CRON_SECRET>`
   header:

   ```cron
   # Product sync — 2:00 AM daily
   0 2 * * * curl -s -o /dev/null -H "Authorization: Bearer <YOUR_CRON_SECRET>" https://<your-app-domain>/api/cron/woocommerce-sync
   # Expiry scan — 3:00 AM daily
   0 3 * * * curl -s -o /dev/null -H "Authorization: Bearer <YOUR_CRON_SECRET>" https://<your-app-domain>/api/cron/expiry-scan
   ```

---

## Phase 5: Verify Setup (use the SYNC dashboard)

Open **HOSPO OPS → Woo Sync** (`/admin/sync`). The activity feed auto-refreshes
every 10 seconds and shows every pull, push, and webhook — errors in red.

1. Click **↓ PULL PRODUCTS NOW** — you should see a `PULLED N PRODUCTS...`
   SUCCESS row, and the imported products under **Recipes & Menu Items**.
2. Create a test order in WooCommerce — a `ORDER #... SYNCED (ORDER.UPDATED)`
   WEBHOOK row appears within seconds, and the order shows on **Orders**.
3. Edit a product in WooCommerce — a `PRODUCT #... UPDATED FROM WEBHOOK` row
   appears and the menu item updates.
4. Edit a linked menu item's price in HOSPO OPS — a `PUSHED ... TO WOOCOMMERCE`
   row appears and the price changes on the store.
5. Change an order's status on the **Orders** page (expand the order → STATUS
   dropdown) — a `PUSHED ORDER #... STATUS` row appears and the WooCommerce
   order updates.
6. Verify the **WOOCOMMERCE** section in **Settings** shows `LAST SYNC: <timestamp>`.
7. Link each imported product to a **Recipe** to enable inventory explosion on
   order.

---

## Updating an Existing Deployment (pre two-way-sync versions)

Already running HOSPO OPS with the old WooCommerce integration (daily cron +
order webhook only)? Follow these steps to upgrade. Your existing integration
credentials, orders, and menu items are untouched.

### 1. Pull the new image and redeploy

- **Portainer (Repository stack):** open the stack → **Pull and redeploy**.
  The compose file is re-read from the repo, so the new settings come with it.
- **Plain docker compose:**

  ```bash
  cd heavens-hospo-helper
  git pull
  docker compose pull
  docker compose up -d
  ```

The new `SyncLog` database table is created automatically on container start
(`prisma db push` runs in the entrypoint) — no manual migration needed.

### 2. docker-compose / environment changes

| Setting | Change needed |
|---------|---------------|
| `INTERNAL_CRON` | **Nothing** — new optional variable, defaults to `true` (scheduler on). Only set it (to `false`) if you want to keep your external cron setup. |
| `CRON_SECRET` | Now **optional**. Previously required for the product sync — the internal scheduler doesn't use it. Keep it only if you keep external cron jobs. |
| Compose file itself | If you maintain a **modified copy** of `docker-compose.yml`, add the new env line to the `app` service: `INTERNAL_CRON: ${INTERNAL_CRON:-true}`. Stock compose users get this automatically via `git pull` / stack re-pull. |

> **Heads up:** if your image tag is pinned (e.g. `IMAGE_TAG=v1.x`), bump it —
> `latest` (or `develop`) includes the two-way sync.

### 3. Remove the old host crontab entries

The old SOP had you add curl jobs to the host crontab (2:00 AM product sync,
3:00 AM expiry scan). The internal scheduler now covers both, so remove them:

```bash
crontab -e
# delete the two lines hitting /api/cron/woocommerce-sync and /api/cron/expiry-scan
```

(Leaving them is harmless — the endpoints are idempotent — but redundant.)

### 4. Add the new product webhooks in WooCommerce

Your existing `Order updated` webhook keeps working unchanged. Add webhooks
**2–4** from Phase 3 (`Product created` / `Product updated` /
`Product deleted`) using the **same Webhook Secret** so product changes sync
instantly instead of overnight.

### 5. Verify

Open **HOSPO OPS → Woo Sync** (new sidebar entry under Operations) and run
through Phase 5. Container logs should show `[internal-cron] started` on boot,
and a product pull appears in the feed within ~15 seconds of startup.

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| `Delivery URL returned response code: 401` when SAVING a webhook in wp-admin | Update HOSPO OPS — older versions rejected WooCommerce's unsigned activation ping. Current versions acknowledge it (a `WEBHOOK ACTIVATION PING ACKNOWLEDGED` row appears on `/admin/sync`). After updating, re-save the webhook and set its Status back to Active. |
| Nothing on the SYNC dashboard | Verify the integration is ACTIVE in Settings and credentials are saved. Check container logs for `[internal-cron] started`. |
| Orders not appearing | Look for red `WEBHOOK REJECTED` rows on `/admin/sync`. `SIGNATURE DID NOT MATCH` means the webhook Secret in WordPress doesn't exactly match the Webhook Secret in Settings. No rows at all → verify the Delivery URL is reachable from WordPress (WooCommerce → Settings → Advanced → Webhooks → Logs). |
| Webhooks blocked behind Cloudflare Access | Add a **Bypass** policy for `/api/webhooks/*` — WordPress can't pass a Cloudflare login. The endpoint is HMAC-verified by the app itself. |
| Products not syncing instantly | Verify the three product webhooks from Phase 3 exist and are Active. The 15-minute pull will still catch changes. |
| Product pull empty / PULL FAILED | Click the event row on `/admin/sync` — the dark detail box shows the exact response. `HTTP 401`: many hosts strip the Authorization header; the app automatically retries with query-string auth, so a persistent 401 means the Consumer Key/Secret are wrong (re-paste BOTH in Settings — masked dots keep the old value) or lack Read/Write permission. Also check STORE URL has no trailing slash. |
| `woocommerce_rest_cannot_view` (WordPress behind Cloudflare Tunnel / proxy) | WordPress can't detect HTTPS (`is_ssl()` is false), so WooCommerce rejects plain credentials. The app automatically falls back to OAuth 1.0a signed requests, which work regardless. You can also fix WordPress itself — add to `wp-config.php` above `/* That's all */`: `if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') { $_SERVER['HTTPS'] = 'on'; }` |
| `PRODUCT UPSERT FAILED ... MenuItem_recipeId_fkey` | Fixed in current versions (imported products no longer require a recipe). Update the app — the schema change applies automatically on redeploy. |
| Pushes failing (`PUSH FAILED — HTTP 401`) | Consumer Key permissions must be `Read/Write`, not `Read`. |
| `PUSH SKIPPED — NO LINKED WOOCOMMERCE PRODUCT` | The menu item has no WOO PRODUCT ID — link it on the Recipes & Menu Items page. |
| Sync loops (same change bouncing back and forth) | Should not happen — pushes are stamped with `_updated_by: hospo-ops` and echo webhooks within 2 minutes are skipped (logged as `SKIPPED — ECHO OF OUR OWN PUSH`). |
| 401 Unauthorized on /api/cron | Verify `CRON_SECRET` env var is set and matches the `Authorization: Bearer` header exactly. |
| Secrets masked after save | This is by design. To update a secret, type the new value in the password field and save. Leaving it as dots preserves the existing secret. |

---

## Auto-Seating (Optional)

When a WooCommerce order includes `partySize` and `fulfillmentDate` in its `meta_data`:

1. The webhook creates a `CalendarEvent` for the fulfillment date.
2. A `FloorPlanSetup` is generated on the venue's default floor plan.
3. Tables are auto-assigned from available `TableProfile` pools using a greedy fit algorithm.
4. All tables are grouped into a `TableGroup` on the PixiJS canvas.
5. The order shows `✓` (seated) on the Orders dashboard.
