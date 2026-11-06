# HOSPO OPS — Menus, products, serves & consumption

This is the design note for how **menus, products, stock and sales consumption**
fit together — where it is today, where it is going, and the rules we must
enforce. It is a living document; keep it in sync as the build progresses.

> Short version: a **Menu groups products**. Each product carries **one serve
> spec** that says how selling it eats stock. That serve spec *is* the POS link.
> It is authored from the **Menus page**, not a separate mapping screen.

---

## 1 · The five layers (what exists today)

```
① STOCK            what we buy / hold          → InventoryItem
   IVANOV VODKA · LIME JUICE · HAVANA ESPRESSO · KEG - BRB HAZY · SAUV BLANC BOTTLE
        │  ingredients (UOM + qty)
        ▼
② BUILD            how a drink is assembled    → Recipe + RecipeLineItem
   MARGARITA BUILD = 30ml Blanco Tequila + 15ml Triple Sec + Lime + Simple Syrup
        │
        ▼
③ PRODUCT          the thing on the menu       → MenuItem
   "MARGARITA" $21 · recipe=MARGARITA BUILD · description · allergens · image
        │  membership (MenuMenuItem)
        ▼
④ GROUP            the menu                    → Menu (+ MenuMenuItem)
   "AKARANA COCKTAILS" → [Margarita, Espresso Martini, Aperol Spritz…]
        │  row source
        ▼
⑤ REFERENCE        the interactive table       → Guide (PRODUCT_REFERENCE)
   ITEM | PRICE | DESC | GLASSWARE | SERVE | METHOD | …
```

All five already exist. Layer ⑤ now **sources its rows from a Menu** (v1) and each
product carries a **serve spec** — the app's POS item link — that also drives the
table's **SERVE METHOD / SERVE SIZE** columns (both built — see §5). What remains
is the consumption engine that turns exported sales into stock deductions (§5
later).

### What the reference table does today

- Rows can still be hand-added one product at a time (`+ ADD ITEM`), but a table
  can also declare a **source menu** and pull that menu's products in with
  **SYNC FROM MENU**. `GET /api/admin/guides/link-targets` returns the flat
  venue product list (`MENU_ITEM`) **and** each menu with its ordered product ids
  (`MENU: [{ value, label, itemIds }]`).
- `Guide.sourceMenuId` records the source menu (provenance + re-sync). Sync is
  **additive** — `mergeMenuRows` (`lib/reference-table.ts`, pure) appends a row
  per menu item not already present, so hand-added off-menu rows and typed cells
  are never lost. Rows stay plain `GuideTableRow`; the read/render/PDF paths are
  unchanged. `scopedMenuId` (`lib/guides.server.ts`) validates the source on save.
- Each `GuideTableRow` links one `MenuItem` (`menuItemId`) and stores manual
  `cells`. Derived columns (`ReferenceColumn.type === 'MENU_FIELD'`) read live
  from the product: only **NAME / PRICE / DESCRIPTION / IMAGE / DIETARY**
  (`lib/reference-table.ts`). `lib/reference-table.server.ts` batch-loads them.
- **Recipes are still ignored** (the table reads the 5 scalar fields above, never
  the BOM); the **METHOD / SERVE** columns are derived from the product's serves
  (built — see §5 / §8).

> **Deploy:** `Guide.sourceMenuId` is a nullable column — schema-only, ships via
> `db push` (no migration script).

---

## 2 · The target: one serve spec per product

The problem with a separate "POS links" screen (how Loaded does it) is that the
same relationship — *"this product draws this much from this stock item"* — is
the thing that (a) renders the reference table's SERVE/METHOD columns, (b)
decrements stock when sold, and (c) maps a POS sale back to a product. Doing it
in three places invites drift.

**Unified into one serve spec, owned by the product and authored on the Menus
page (built — `MenuItemServe`, §5):**

```
Menu ── groups ──► MenuItem (the product)
                       │
                       └── SERVE SPEC
                             • stock item it draws from
                             • qty + UOM            (e.g. 400 mL, or 1 EA)
                             • method               MADE | DRAUGHT | POURED | BOTTLED | WINE | …
                             • recipe link          (when MADE)
                             • POS item id          (so exported sales map in)
```

### Consumption vs serve — the terminology

- **Serve spec** = *how a sold item maps to stock* (the input).
- **Consumption** = *the stock deduction event* (the output: sale → stock down).

They are two sides of one coin. The POS/sales feed supplies the **sale**; Hospo
Ops owns the **serve**, and therefore the consumption.

```
POS sale (from the SQL export)        SERVED AS              CONSUMES
  "Margarita  × 3"          ──────►  recipe MARGARITA  ──────►  90ml tequila, 45ml triple sec…
  "RAY C Beer × 2 (400ml)"  ──────►  DRAUGHT 400ml     ──────►  800ml from the keg
  "Heineken   × 1"          ──────►  BOTTLED (1 EA)    ──────►  1 bottle
```

### Consumption types (drives the extra fields + the table columns)

| Type | Examples | Carries |
|---|---|---|
| **MADE** | Margarita, Latte, Smoothie, Iced Coffee | a linked `Recipe` |
| **DRAUGHT** | Tap Beer 400ml / 1.4L | serve size(s) + keg stock item |
| **POURED** | Spirits / Liqueurs 30ml | serve size + bottle stock item |
| **BOTTLED / CANNED** | Heineken 330ml, Coke | serve size (1 EA) + unit stock item |
| **WINE** | Glass / Carafe / Bottle | sizes + bottle stock item |
| **WATER / SOFT** | Voyage Water, Peach Iced Tea | product + sizes |

---

## 3 · The rules we must enforce (the "logic")

Loaded's recipe editor lets you pick **any** unit for any line (a "Keg" of juice)
with no validation. Ours must not. Our engine is already smarter — it just isn't
gated at author time.

### 3.1 UOM kind must match — ✅ enforced

`UomKind = VOLUME (mL) | MASS (g) | COUNT (ea)` (`lib/unit-convert.ts`).

- A recipe/ingredient line may only use a UOM whose kind the target allows — its
  own kind plus any bridge: density (`densityGramsPerMl`) reaches VOLUME↔MASS, a
  unit weight (`weightPerUnitGrams`) reaches COUNT↔MASS.
- `allowedKinds` / `uomsForItem` (pure) drive the editor's unit dropdowns
  (`RecipesClient.tsx`), and the recipe **POST/PUT routes reject** an incompatible
  line server-side (`lib/recipe-line-kinds.server.ts`) — so it can't be bypassed
  from any path.

### 3.2 A serve may not exceed / contradict its stock item

| Stock item | Kind | Legal serve | Illegal serve |
|---|---|---|---|
| Heineken 330ml bottle | COUNT (1 EA) | "1 bottle" | "1 cup" (VOLUME) → blocked |
| Keg — RAYC | VOLUME (e.g. 50,000 mL) | 400 mL / 1,400 mL | "1 EA" → blocked |
| Gin bottle (1 L) | VOLUME (1,000 mL) | 30 mL | "1 EA" → blocked |
| Flour | MASS (g) | 1 CUP *if* density set | 1 CUP with no density → flagged |

So the serve-size control must only offer UOMs **of the same kind** as the stock
item. Related field already present: `InventoryItem.yieldPercentage` (pour loss:
foam/head/spill a keg or bottle doesn't yield 100%).

### 3.3 POS id on the product — ✅ built

`MenuItem.swiftPosId` (built) holds the SwiftPOS `Inventory_Code`, so a sold POS
line maps to a product and its serves consume stock. `Venue.swiftPosBaseUrl`
(built) holds the SwiftDOSnet base URL. See §8.

---

## 4 · What to copy from Loaded, and what not to

Seen in the Loaded knowledge-base screens:

| Loaded screen | Keep | Avoid |
|---|---|---|
| **Manage Stock Items** (grouped, Default Supplier / Count By / Order By / Forecast+LIVE) | grouping + count/order UOM + live price — we already have this shape | — |
| **Item modal — Supplier Codes** (several suppliers, "Default For Supplier") | multi-supplier per item — we have `SupplierItemCode` + `InventoryItem.alternativeSupplierIds` | hiding suppliers behind a single "default" |
| **Recipe editor** (Qty \| Unit \| Description, any unit) | the simple row shape | letting any unit through — enforce §3.1 |
| **Manage POS Item Links** (POS Item → Stock Item + Qty, COGS) | the *relationship* it captures | a separate mapping page — do it from the Menus page via the serve spec |

---

## 5 · Build order

### v1 — Reference table from a Menu — ✅ BUILT

1. ✅ A `PRODUCT_REFERENCE` guide declares a **source menu** (`Guide.sourceMenuId`)
   and pulls its products in with **SYNC FROM MENU**. Hand-added off-menu rows
   are kept.
2. ✅ `link-targets` returns `MENU` (each menu + its ordered product ids) and the
   flat `MENU_ITEM` list. `mergeMenuRows` does the additive merge; the editor
   persists the source on save.
3. ⬜ Remaining derived column sources: `RECIPE BUILD` (ingredients from
   `MenuItem.recipe`) and per-variation prices (Glass / Carafe / Bottle) from
   `MenuItem.variations`.
4. ⬜ Surface from the **Menus page** as an entry point (it already lives in
   Training → Playbook; worker phone + PDF already work).

### Serve spec — the app's POS item link — ✅ BUILT

5. ✅ **`MenuItemServe`** (method + qty + unit + one linked stock item **or**
   recipe), authored on the **Menus page** (each menu item's **SERVES** button →
   `MenuItemServesEditor`). One product can carry several serves (tap beer
   400ML / 1.4L, wine GLASS / CARAFE / BOTTLE). API
   `GET/PUT /api/admin/menu-items/[id]/serves` (replaces the set) **enforces the
   unit-kind rule server-side** — a pour whose unit kind differs from the stock
   item's is rejected (the bottle-as-a-cup guard). Pure `lib/menu-serves.ts`.
6. ✅ The reference table gained **SERVE METHOD** + **SERVE SIZE** derived columns
   (`ReferenceColumnType` `METHOD` / `SERVE`), read from the product's serves by
   `reference-table.server.ts` `loadMenuItemIndex`; `link-targets` returns the
   full product + serve summary for the editor.
7. ✅ `MenuItem.swiftPosId` (the SwiftPOS `Inventory_Code`) so POS sales map to a
   product, plus `Venue.swiftPosBaseUrl` — see §8.
8. ✅ Hard-gated the **UOM kind** in the **recipe editor** too (§3.1) — the unit
   dropdowns now offer only dimensions the ingredient allows (`allowedKinds` /
   `uomsForItem`), and the recipe POST/PUT routes reject an incompatible line
   (`lib/recipe-line-kinds.server.ts`). The "recipes allow anything" gap is closed.

### Next — consumption (see §8)

9. ✅ Ingest SwiftPOS sales from **SwiftDOSnet** (§8) → match `swiftPosId` → explode
   each serve (recipe or pour) → reconcile against on-hand
   (`lib/swiftpos-consumption.server.ts`; `lib/inventory-engine.ts` + the existing
   `/api/admin/inventory/reconcile` do the same for Woo orders). **Built** — the
   Settings → SWIFT POS tab runs it; auto-deduct is pending.

---

## 6 · Open decisions

- **Where the serve spec lives:** on the product (one truth everywhere) vs.
  per-menu (happy-hour/promo sizes). Recommendation: **on the product** — POS
  sales are attributed to products, not menus, so per-menu serves would make
  consumption ambiguous. Menus handle *pricing*, not *consumption*.
- **Per-variation prices** in the reference table (wine Glass/Carafe/Bottle):
  read from `MenuItem.variations` or store as manual cells for v1?

## 7 · Worked example — Akarana Beverage Menu

Source: `mock_data/Beverage Menu.pdf`. Groups to create as menus: TAP BEER,
BOTTLE BEER, SPIRITS, LIQUEURS, COFFEE, TEA, SMOOTHIES, SOFT DRINKS, JUICES,
WINE (by varietal), COCKTAILS, MOCKTAILS.

```
MENU: BEVERAGE — TAP BEER
┌────────────────────────┬───────┬───────┬──────────┬──────────┐
│ ITEM (product)         │ 400ML │ 1.4L  │ METHOD   │ STOCK    │
├────────────────────────┼───────┼───────┼──────────┼──────────┤
│ Asahi 5%               │ 16.50 │ 56.00 │ DRAUGHT  │ KEG-ASAHI│
│ Sawmill Pilsner 4.8%   │ 16.00 │ 52.00 │ DRAUGHT  │ KEG-PILS │
└────────────────────────┴───────┴───────┴──────────┴──────────┘

MENU: BEVERAGE — COCKTAILS
┌──────────────────┬──────┬──────────────────────────────┬──────────────┐
│ ITEM             │PRICE │ BUILD (from recipe)          │ GLASSWARE    │
├──────────────────┼──────┼──────────────────────────────┼──────────────┤
│ Margarita        │ 21   │ Blanco Tequila, Triple Sec,  │ Coupe        │
│                  │      │ Lime, Simple Syrup           │              │
│ Espresso Martini │ 21   │ Vodka, Espresso, Crème de    │ Martini      │
│                  │      │ Cacao, Caramel               │              │
└──────────────────┴──────┴──────────────────────────────┴──────────────┘
```

---

## 8 · SwiftPOS sales → consumption (via SwiftDOSnet)

The POS feed comes from **SwiftDOSnet** — a separate service that mirrors SwiftPOS
(MS SQL) into a Postgres warehouse (`raw` schema) and serves it over a local HTTP
API. **HOSPO OPS is the client**; it never touches SwiftPOS directly.

### The contract

One call gives per-product sales for an inclusive date range:

```
GET {SWIFTDOSNET}/api/analytics/sales?groupBy=product&from=YYYY-MM-DD&to=YYYY-MM-DD
→ { groupBy, rows: [{ Key, Label, Gross, Net, Gst, Receipts, Qty, Avg }], totals }
```

- `Key`   = SwiftPOS `Inventory_Code` (`EJItemsTable.InventoryCode` = `ProductTable.Inventory_Code`)
- `Label` = product description (from `ProductTable`)
- `Qty`   = quantity sold. SwiftDOSnet already excludes voids, `Qty = 0` lines,
  `Ø%` system lines and modifier print-groups (0 / 20) — so a row is a real sale.

### The mapping

```
POS sale line ── InventoryCode ──► MenuItem.swiftPosId ──► serves ──► stock drawdown
```

- `MenuItem.swiftPosId` (built) holds the SwiftPOS code; `Venue.swiftPosBaseUrl`
  (built) holds the SwiftDOSnet base URL. A sale with no matching product is the
  **mapping gap** to fix (set its `swiftPosId`).

### Built

- `lib/swiftpos.ts` (pure): `parseSalesReport` + `matchSalesToItems`
  (case-insensitive code match, returns matched + unmatched + totals). 5 tests.
- `lib/swiftpos.server.ts`: `fetchProductSales(baseUrl, from, to)`.
- `lib/swiftpos-consumption.server.ts` `computeSwiftPosConsumption` — the
  **stock drawdown**: expand each matched sale through the product's serves
  (`serve.qty × soldQty`; MADE → `explodeRecipe`; POURED / DRAUGHT / BOTTLED /
  WINE → the linked stock item, via `canonicalQty` in `lib/unit-convert.ts`, using
  the same grams-when-bridged rule as the recipe engine) and reconcile against
  on-hand.
- `GET /api/admin/swiftpos/sales?from=&to=` (guard `ops.inventory.view`, MANAGER
  scoped): pulls + matches; add `&drawdown=1` to also get the drawdown +
  per-item variance + any expansion errors.

### Built (UI)

- **Settings → SWIFT POS** tab (`components/admin/SwiftPosSalesClient.tsx`,
  added to `SETTINGS_TABS`): set the SwiftDOSnet base URL (saved via
  `PUT /api/admin/venues/[id]` `swiftPosBaseUrl`), pick a date range, and **RUN**
  the pull. Shows the sold/matched products, the **unmatched mapping gaps**, and
  the **stock drawdown** vs on-hand (negative variance in red) + expansion
  problems. Read-only.

### Built (staff sync, 2026-10-22; PIN-on-link 2026-10-29)

- **Settings → SWIFT POS → STAFF SYNC** (`SwiftPosStaffSync`): pulls clerks from
  SwiftDOSnet `GET /api/lookups` and links them to `Staff.swiftPosId`. Each clerk
  is LINKED (exact code), SUGGESTED (one unlinked staff member with the same name
  tokens) or NEW. LINK/UNLINK update the staff row; CREATE makes a floor `STAFF`
  profile using the clerk number as the 1–4 digit worker PIN (bcrypt-hashed,
  collision-checked at the venue). LINK also sets the PIN from the clerk id (or
  the typed override) when the staff has **no** PIN; an existing PIN is never
  overwritten — the response reports `PIN ALREADY SET FROM CLERK ID` /
  `EXISTING PIN KEPT`, and a PIN clash links without changing it. Pure rules in
  `lib/swiftpos-staff.ts` (`parseClerks`, `splitClerkName`, `buildClerkRows`,
  `validClerkPin`).
  Routes: `GET /api/admin/swiftpos/staff` (`team.staff.view`),
  `POST /api/admin/swiftpos/staff` (`team.staff.edit` for LINK/UNLINK,
  `team.staff.create` for CREATE). Server-side only — SwiftDOSnet has no auth.

### Built (menu-item linking, 2026-10-27)

- **Settings → SWIFT POS → MENU LINKS** (`SwiftPosMenuLinks`): every SwiftPOS
  product grouped by its POS category (collapsible), search + category filter,
  linked/unlinked counts, and LINK/UNLINK per row. Orphan codes (local codes
  missing from the POS master) and duplicate codes (one code on several local
  products — `swiftPosId` is not unique) are surfaced, never silently resolved.
- `lib/swiftpos-products.ts` (pure): `parseProducts` (paged envelope
  `{ rows, hasMore, total }`, camel/Pascal, short flags), `buildProductLinks`
  (case-insensitive, linked/unlinked/orphans/duplicates) and
  `groupProductsByCategory`. 7 tests.
- `fetchProducts(baseUrl)` pages `/api/products` at 100/page up to 2,000 rows
  and reports `truncated`; the fetch helper surfaces SwiftDOSnet problem
  `title`/`detail` text.
- Routes: `GET /api/admin/swiftpos/menu-links` (`ops.menus.view`) and `PUT`
  (`ops.menus.edit`). PUT writes `MenuItem.swiftPosId` only (no Woo push) and
  409s when another local product already holds the code. The product-info
  popup on a menu line also edits the code through the same route.

### Built (kitchen dockets, 2026-10-27)

- **Ops → Orders → DOCKETS** (`/admin/ops?tab=orders&sub=dockets`): live open
  sales from SwiftDOSnet `GET /api/table-tracking/kitchen-dockets`, one card per
  docket with table/booking, covers, clerk, terminal and opened time. Lines show
  quantity, seat and print group; instruction/modifier lines are nested.
  Auto-refreshes every 30 s only while the tab is visible, with manual REFRESH
  and 30 / 60 / 120 min / ALL LINES windows.
- `lib/swiftpos-dockets.ts` (pure): `parseKitchenDockets` (bare array,
  camel/Pascal, drops malformed rows) and `docketWindow` — unzoned venue-local
  `YYYY-MM-DD HH:mm` strings. The feed's `opened`/`addedAt` are unzoned
  wall-clock, so they are rendered as-is. 8 tests.
- Route `GET /api/admin/swiftpos/dockets?venueId=&minutes=` (`orders.orders.view`,
  default 60) proxies the feed, 400s when the venue has no base URL and 502s
  with the SwiftDOSnet problem detail.

### Live smoke test (2026-10-29)

SwiftDOSnet (`swiftdosnet-web` + `swiftdosnet-postgres` + `swiftpos-sql`) was
reached from the app container via `http://host.docker.internal:5080`. Staff sync
listed clerks, menu links listed the product catalogue, kitchen dockets rendered,
and the linked worker PIN verified against the SwiftPOS clerk id. Everything
remains read-only; no stock was mutated.

### Still to do

1. **Auto-deduct** (write the drawdown back to stock) vs. review-then-post — a
   decision. Currently the tab only *reports*; nothing mutates `totalQty`.
2. **Trading-day window** — SwiftPOS uses a 06:00 start-of-day; the pull currently
   uses calendar dates from/to.
3. **Schedule the pull** (internal cron) so drawdown is ready each morning.

> **Important:** SwiftPOS's own `RecipeTable` / `EJRecipeUsageTable` are **empty**,
> so SwiftPOS does not supply recipe drawdown — consumption must be computed here
> from our serve spec. Do not expect the POS to hand it over.

---

## 9 · The menu builder — groups, stock lines, sizes & live preview (built 2026-10-06)

The Menus page was rebuilt from a modal into a **full-width builder** with a
**live plain-text preview** on the right (the printed-menu look — groups, items
and their size/price columns). See `components/admin/MenuBuilder.tsx` +
`MenuPreview.tsx`.

### Model

- **`MenuGroup`** — a grouping *inside* a menu ("TAP BEER", "PIZZA"). Purely
  presentational: it orders and labels the lines. Soft-deleted; removing one
  un-groups its lines.
- **`MenuMenuItem` is now polymorphic** — a line is EITHER a product
  (`menuItemId`) OR a stock item (`inventoryItemId`), never both. This is what
  lets a beverage bottle or a can of Coke go straight onto a menu. It also
  carries `groupId` and, for **stock lines**, `sizeOptions` JSON
  (`[{ label, price }]`).
- **Product sizes live on the product** (`MenuItem.variations`, shared across
  every menu it is on) — authored here or in the recipe editor, and pushed to
  WooCommerce as variations. Stock-line sizes live on the line (`sizeOptions`).
- Pure brain: **`lib/menu-lines.ts`** (`cleanSizes`, `variationSizes`,
  `lineSizes`, `groupMenuLines`, `formatSizePrice`) — Prisma-free, shared by the
  builder, the preview and the server. `lib/menu-lines.server.ts` holds the
  `menuInclude` + `shapeMenuLine` read shape.

### "ITEM LINKS" (was "LINK TO WOO")

The recipe editor's `LINK TO WOO` section is renamed **ITEM LINKS** and now
brackets the whole POS relationship in one place: the WooCommerce product
(category, image, variable sizes), the **SwiftPOS code** (`MenuItem.swiftPosId`,
now editable + saved through the recipe route) and the **serve spec**
(`MenuItemServesEditor`) so consumption is authored where the product is.

### Routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/admin/menus` | GET | Menus with groups + shaped lines (product **or** stock) |
| `/api/admin/menus/[id]` | PUT | Save groups + lines (diffed by id; temp group ids resolved) |
| `/api/admin/menus/options` | GET | Products **and** inventory for the builder's ADD ITEM search (one `ops.menus.view` guard) |
| `/api/admin/menus/cogs` | POST | Batch COGS per product (`{ menuItemIds }` → `{ cogs }`) for the builder |
| `/api/admin/menu-items/[id]/sizes` | PUT | Save a product's shared size/price options (merges `wooVariationId`, pushes) |

### Inventory deep form

The dead `QTY` inputs beside COUNTING UOM / ORDERING UOM were removed — the
counting unit is canonical and only **PAR LEVEL** carries a number (in the
counting unit).

---

## 10 · Item-list redesign + COGS (built 2026-10-07)

The builder was reworked into a **group → item list** with no nested box chrome:

- **Flat sections, no blocks.** Menu name / status / description / Woo category
  sit at the top with plain spacing; groups are a coloured header + indented item
  rows. The old per-line bordered card and the inline SIZES sub-panel are gone.
- **PAX is opt-in.** A `PAX RANGE: ON/OFF` toggle reveals MIN/MAX; off (the
  default) stores `null`, `null`.
- **Drag-and-drop.** Item rows are HTML5-draggable: drop on another row to
  reorder (and adopt its group), or on a group header to re-file. `UNGROUPED`
  is a drop target too. `↑`/`↓` still reorder groups.
- **List prices + COGS per row.** Each product row shows its list prices and
  `COGS $x.xx · M n%`; `EDIT` opens `MenuLineEditor` — a focused popup that
  edits the fields the menu owns (price, sizes, min/max, group, active), shows
  COGS vs the ex-GST price, and offers `ITEM LINK` (the serve spec).

### COGS — `lib/menu-cogs.ts` + `lib/menu-cogs.server.ts`

Pure brain + DB half. `costPrice` is taken as the price for **one
`InventoryItem.unit`** (`$8.50 / KILOGRAM`, `$5.20 / LITRE`, `$0.45 / EACH`).
`explodeRecipe` reports each ingredient canonically (GRAMS when the item has a
density / unit-weight bridge, else the line dimension's base unit); the pure
`costOfCanonicalQty` converts that to the item's cost unit (bridging through
density / unit weight when the cost unit's dimension differs). A product with a
linked **recipe** is costed per yield unit; otherwise its **first serve** (a
stock pour or a recipe) is costed. `POST /api/admin/menus/cogs` batches it for
the ids the builder is showing, so a menu page never explodes every recipe up
front. `priceExGst` (15% NZ default) and `grossMarginPct` render the comparison.

## 11 · Menu import from a PDF — contract, editable preview & idempotency (Phase 1, built 2026-11)

The app has no backend LLM. `⬆ IMPORT MENU` (Menus page) implements the same
copy-paste pattern as the Pantry Bible density helper:

1. Copy the generated prompt (or download it as `.md`) into any LLM with the PDF
   menu attached.
2. Paste the JSON answer back (or load a `.md`/`.json`/`.txt` file).
3. Review and **edit** the preview before importing: AREA/GROUP, sizes and
   detected option deltas per item, rename groups/items, move items between
   groups, reorder groups/items, include/skip per line. Selection is keyed by a
   stable generated draft id, so renaming a row never loses its tick.
4. Import into a **new** menu or append to an **existing** menu. A summary card
   shows `created / matched / lines added / lines updated / skipped` and the
   warnings.

### The import contract (`lib/menu-import.ts`)

Each item carries `name`, `price`, `description`, optional `sizes`
(`[{ label, price }]`) and optional `options`
(`[{ name, required, min, max, choices: [{ name, priceDelta }] }]`). Groups carry
`name` + `area`; when the answer comes back **flat**, item-level `group` / `area`
buckets the rows. Prices and deltas are parsed tolerantly (`$3`, `+3`, `3.00`).
One product is kept per **normalised name** (trimmed, internal whitespace
collapsed, uppercased). The parser returns **structured issues** for a missing
price, missing description, missing size price, missing group and duplicate
names, plus the `MATCH` / `NEW` / `AMBIGUOUS` badges.

### Dietary is not imported

`dietary` was removed from the prompt, parser, preview and route. Allergens come
from the product/recipe, never from an LLM answer. Matched products keep their
stored `dietaryInfo`; new products start blank. The preview and summary both show
**DIETARY NOT IMPORTED**.

### Options are imported (Phase 3)

Parsed option groups/choices are mapped onto the product option model (§12).
Each group is sanitised with `lib/menu-options.ts` (`normaliseOptionGroups` +
`validateOptionGroup`); an invalid group (no choices, `maxSelect` beyond the
choice count, etc.) is **skipped and reported** in the summary warnings.

- **New products** get every valid group and choice.
- **Matched products** are **additive upsert by name**: missing groups and
  missing choices are created, soft-deleted rows are revived by their unique
  key, and the product's existing curated groups/choices are never overwritten
  or removed. Re-importing the same answer creates no duplicate option rows.
- The preview/summary no longer say options are "not yet imported"; the result
  card reports `optionGroupsAdded / optionChoicesAdded / optionsSkipped`.

### What gets written

- New products: `name`, `price` (falls back to the first size price), `description`,
  `variations` built from the imported sizes with `isVariable: true`, and their
  parsed option groups/choices.
- Matched products (same normalised name) keep their current price, description,
  allergens and curated options; no duplicate product or duplicate option is
  created, and only missing option groups/choices are added.
- `Menu`, `MenuGroup`, `MenuMenuItem`. A **re-import upserts the
  `(menuId, menuItemId)` line**, so it re-files/reorders the existing line instead
  of skipping it. Only lines included in the preview are touched.
- The response is the summary `{ menuId, created, matched, linesAdded,
  linesUpdated, skipped, optionGroupsAdded, optionChoicesAdded, optionsSkipped,
  warnings }`.
- Several existing products sharing the normalised name are reported
  **AMBIGUOUS** and skipped — never guessed.

### What does NOT happen

No WooCommerce writes (`wooProductId` stays null and the route never calls
`pushProduct`), no recipes, no stock drawdown, no dietary writes. Options are
price-only (no per-choice recipe/inventory links yet). New products surface
under **INVENTORY → MENU ITEMS** so a recipe/serve can be attached later.
Prices are GST-inclusive NZD. Re-importing the same answer produces 0 created
products, 0 new lines and 0 new option rows; counts only move when the edited
preview re-files/reorders a line or genuinely adds a missing option.

## 12 · Product option groups & choices (Phase 2, built 2026-11)

A product can carry **option groups** with **choices and additive upcharges** —
the Fish & Chips case: `SIDE: FRIES $0 / SALAD $0 / FRIES + SALAD +$3`. Options
belong to the **product** (`MenuItem`), not the menu line, so every menu that
shows the product shares the same choices (matching how sizes and serves work).

### Models

- **`MenuItemOptionGroup`** — `menuItemId`, `name`, `minSelect` (default 0),
  `maxSelect` (default 1), `sortOrder`, soft delete. Unique `(menuItemId, name)`.
- **`MenuItemOptionChoice`** — `groupId`, `name`, `priceDelta` (default 0),
  `isDefault` (default false), `sortOrder`, soft delete. Unique `(groupId, name)`.

Selection is expressed with `minSelect`/`maxSelect`:

| min | max | Meaning |
|---|---|---|
| 0 | 1 | Optional single choice (default) |
| 1 | 1 | Required single choice |
| 0 | n | Choose up to `n` |
| 1 | n | Choose between 1 and `n` |

Rules: `minSelect >= 0`, `maxSelect >= 1`, `minSelect <= maxSelect`,
`maxSelect <= number of choices`, and at most **one** `isDefault` when
`maxSelect === 1`. Upcharges are additive only (`priceDelta >= 0`); negative or
invalid input is floored to 0.

### Authoring

- Each product menu line's **EDIT → OPTIONS** opens `MenuItemOptionsEditor`
  (add/rename/reorder/remove groups and choices, set MIN/MAX, upcharge and the
  default). Saving replaces the product's whole option set.
- `GET/PUT /api/admin/menu-items/[id]/options` (`ops.menus.view` / `ops.menus.edit`,
  MANAGER venue-locked). The PUT is a **replace-set**: omitted groups/choices are
  soft-deleted, and a returning group/choice is **revived by its unique key**
  instead of failing on the unique constraint.
- Pure brain: `lib/menu-options.ts` (`normaliseOptionGroups`,
  `validateOptionGroups`, `describeOptionGroup`, `describeOptionRule`,
  `formatPriceDelta`, `summariseOptionChoices`, `defaultOptionChoice`).
- Menu read shapes carry `options` (`lib/menu-lines.ts` `ShapedMenuLine` /
  `lib/menu-lines.server.ts` `menuInclude`), and both `MenuLineEditor` and the
  live `MenuPreview` render the group rule + choices + deltas.

### Import mapping & demo data (Phases 3–4, built 2026-11)

The PDF import now maps parsed options onto these rows (§11) and the demo seed
creates `FISH & CHIPS` with a required `SIDE` group (`FRIES $0 / SALAD $0 /
FRIES + SALAD +$3.00`) using fixed demo UUIDs. Re-running the seed revives the
demo rows instead of duplicating them.

### Not in Phases 2–4

Order/POS selection, kitchen modifiers, per-choice recipe/stock drawdown and
WooCommerce pushes remain out of scope (Phase 5, deferred).

