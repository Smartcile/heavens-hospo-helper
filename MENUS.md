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

### Still to do

1. **Auto-deduct** (write the drawdown back to stock) vs. review-then-post — a
   decision. Currently the tab only *reports*; nothing mutates `totalQty`.
2. **Trading-day window** — SwiftPOS uses a 06:00 start-of-day; the pull currently
   uses calendar dates from/to.
3. **Schedule the pull** (internal cron) so drawdown is ready each morning.

> **Important:** SwiftPOS's own `RecipeTable` / `EJRecipeUsageTable` are **empty**,
> so SwiftPOS does not supply recipe drawdown — consumption must be computed here
> from our serve spec. Do not expect the POS to hand it over.
