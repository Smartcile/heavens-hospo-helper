# Standard Operating Procedure: WooCommerce Integration Setup

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

1. Return to **WordPress Admin**.
2. Navigate to **WooCommerce → Settings → Advanced → Webhooks**.
3. Click **Add Webhook**.
   - **Name:** `HOSPO OPS Order Sync`
   - **Status:** `Active`
   - **Topic:** `Order updated`
   - **Delivery URL:** `https://<your-app-domain>/api/webhooks/woocommerce`
   - **Secret:** Paste the exact **Webhook Secret** you generated in Phase 2, Step 4.
   - **API Version:** `WP REST API Integration v3`
4. Click **Save Webhook**.

> **Note:** The `Order updated` topic fires on both creation and updates, covering all order lifecycle events.

---

## Phase 4: Product Sync Cron Job

1. Set the `CRON_SECRET` environment variable in your Docker deployment. Generate a strong secret:

   ```bash
   openssl rand -base64 32
   ```

2. Configure your external cron scheduler (Linux crontab, AWS EventBridge, etc.) to `GET` the sync endpoint daily:

   ```
   Method:  GET
   URL:     https://<your-app-domain>/api/cron/woocommerce-sync
   Header:  Authorization: Bearer <YOUR_CRON_SECRET>
   ```

   **Example crontab** (runs at 2:00 AM daily):

   ```cron
   0 2 * * * curl -s -o /dev/null -H "Authorization: Bearer <YOUR_CRON_SECRET>" https://<your-app-domain>/api/cron/woocommerce-sync
   ```

3. (Optional) Configure the **Expiry Scan** cron job to run at 3:00 AM daily:

   ```
   Method:  GET
   URL:     https://<your-app-domain>/api/cron/expiry-scan
   Header:  Authorization: Bearer <YOUR_CRON_SECRET>
   ```

   ```cron
   0 3 * * * curl -s -o /dev/null -H "Authorization: Bearer <YOUR_CRON_SECRET>" https://<your-app-domain>/api/cron/expiry-scan
   ```

---

## Phase 5: Verify Setup

1. Create a test order in WooCommerce.
2. Check **HOSPO OPS → Orders** — the order should appear immediately.
3. Verify the **WOOCOMMERCE** section in **Settings** shows `LAST SYNC: <timestamp>`.
4. Imported products appear in **HOSPO OPS → Menu Items**. Link each imported product to a **Recipe** to enable inventory explosion on order.

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Orders not appearing | Verify Webhook Delivery URL is correct and reachable from WordPress. Check WooCommerce → Settings → Advanced → Webhooks → Logs for delivery failures. |
| Product sync empty | Verify Consumer Key/Secret have Read permissions. Check STORE URL has no trailing slash. |
| 401 Unauthorized on cron | Verify `CRON_SECRET` env var is set and matches the `Authorization: Bearer` header exactly. |
| Secrets masked after save | This is by design. To update a secret, type the new value in the password field and save. Leaving it as dots preserves the existing secret. |

---

## Auto-Seating (Optional)

When a WooCommerce order includes `partySize` and `fulfillmentDate` in its `meta_data`:

1. The webhook creates a `CalendarEvent` for the fulfillment date.
2. A `FloorPlanSetup` is generated on the venue's default floor plan.
3. Tables are auto-assigned from available `TableProfile` pools using a greedy fit algorithm.
4. All tables are grouped into a `TableGroup` on the PixiJS canvas.
5. The order shows `✓` (seated) on the Orders dashboard.
