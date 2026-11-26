// Pure event pricing. The MENU_SELECTION and DRINKS_SELECTION blocks carry
// `items: [{ menuItemId, qty, unit?, servesMin?, servesMax? }]`; this sums them
// against live MenuItem prices so the event, its PDF and its customer share
// page can show a total and balance.
//
// Event menus are sold in mixed units (#192):
//   EACH        — canapés / walk-n-fork items, quantity = the stored count
//   PER_PERSON  — a set menu, quantity = the guest count (falls back to the
//                 stored count when no guest count is supplied)
//   PER_PLATTER — a platter, quantity = the stored platter count, with a
//                 "serves 4-6" yield carried for the reader
//
// Only NON-CASH facts are stored on a line (`unit`, `servesMin`/`servesMax`).
// Money is always the live MenuItem / Menu price. Nullable product metadata
// (`minQty`, `leadTimeDays`, `servesMin`/`servesMax`) supplies the defaults;
// a stored line value wins.
//
// A package line (`packageId`, no `menuItemId`) prices from a Menu acting as a
// set-menu package — `Menu.pricePerPerson` for a PER_PERSON menu. Package lines
// only materialise when the caller supplies `options.packages`, so the
// pre-order path (which passes no options) keeps its historical product-only
// lines.
//
// Prisma-free — the caller passes the menu items in.

export type PricingUnit = 'EACH' | 'PER_PERSON' | 'PER_PLATTER'

export const PRICING_UNITS: readonly PricingUnit[] = ['EACH', 'PER_PERSON', 'PER_PLATTER']

export interface EventBlockLike {
  type: string
  config?: Record<string, unknown> | null
}

export interface PriceableLine {
  menuItemId?: string
  packageId?: string
  qty: number
  /** Defaults to EACH when absent/invalid (legacy `{ menuItemId, qty }`). */
  unit?: PricingUnit
  servesMin?: number
  servesMax?: number
  /** Additive upcharge for a chosen option / choice group. */
  priceDelta?: number
  /**
   * Choice-group picks for a PER_PERSON set-menu line (#192). An empty array
   * means "choices are authored" so the min/max rules are validated.
   */
  choices?: LineChoice[]
}

/** One authored pick from a menu's choice group (a non-cash snapshot). */
export interface LineChoice {
  groupId: string
  groupName: string
  choiceId: string
  choiceName: string
  priceDelta: number
}

/** A menu group + its selection rules, for choice validation (#192). */
export interface ChoiceGroupLike {
  id: string
  name: string
  minSelect?: number | null
  maxSelect?: number | null
}

export interface MenuPrice {
  id: string
  name: string
  price: number
  /** Default event unit for a line that carries none (#192). */
  pricingMode?: string | null
  /** "serves 4-6" yield on a platter product. */
  servesMin?: number | null
  servesMax?: number | null
  /** Product default minimum for a direct event line (menu-line minQty wins). */
  minQty?: number | null
  /** Days of notice required before the event date. */
  leadTimeDays?: number | null
}

/** A Menu acting as a per-person package. */
export interface PackagePrice {
  id: string
  name: string
  price: number
}

export interface EventPriceLine {
  /** The product id, or the package id for a package line. */
  menuItemId: string
  packageId?: string
  name: string
  qty: number
  unit: PricingUnit
  unitPrice: number
  total: number
  servesMin?: number
  servesMax?: number
  minimum?: number
  leadTimeDays?: number
  /** Authored choice-group picks, each with its additive upcharge. */
  choices?: LineChoice[]
}

export type PricingViolationKind =
  | 'MISSING_ITEM'
  | 'MISSING_PACKAGE'
  | 'BELOW_MINIMUM'
  | 'INSIDE_LEAD_TIME'
  | 'BELOW_MIN_SELECT'
  | 'ABOVE_MAX_SELECT'

export interface PricingViolation {
  kind: PricingViolationKind
  name: string
  message: string
  menuItemId?: string
  packageId?: string
}

export interface EventPricingOptions {
  /** Guest count — drives every PER_PERSON line. A supplied 0 prices 0 heads. */
  guestCount?: number | null
  /** Venue-local event date key `YYYY-MM-DD` (lead-time comparison). */
  eventDate?: string | null
  /** Venue-local today `YYYY-MM-DD`; omit to skip lead-time checks. */
  today?: string | null
  /** Menus acting as packages for an explicit `packageId` block line. */
  packages?: PackagePrice[]
  /** The event's bound PER_PERSON menu — priced automatically as a package line. */
  package?: PackagePrice
  /** Picks made against the bound menu's choice groups (block-level config). */
  packageChoices?: LineChoice[]
  /** Set when the event's bound menu could not be resolved (purged). */
  missingPackage?: { id: string; name?: string }
  /** The bound menu's choice groups, for min/max selection validation. */
  choiceGroups?: ChoiceGroupLike[]
}

export interface EventTotals {
  lines: EventPriceLine[]
  subtotal: number
  deposit: number
  balance: number
  /** Subtotal split by unit so the readers can group the total. */
  byUnit: Record<PricingUnit, number>
  violations: PricingViolation[]
}

/** Blocks whose items are priced. */
export const PRICED_BLOCK_TYPES = ['MENU_SELECTION', 'DRINKS_SELECTION']

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Accept only a known unit; anything else reads as EACH. */
export function parsePricingUnit(raw: unknown, fallback: PricingUnit = 'EACH'): PricingUnit {
  return (PRICING_UNITS as readonly string[]).includes(String(raw)) ? (raw as PricingUnit) : fallback
}

/** "SERVES 4-6" / "SERVES 4" / null. */
export function formatLineYield(
  servesMin?: number | null,
  servesMax?: number | null,
): string | null {
  const min = servesMin != null && Number.isFinite(Number(servesMin)) ? Number(servesMin) : null
  const max = servesMax != null && Number.isFinite(Number(servesMax)) ? Number(servesMax) : null
  if (min != null && max != null && max > min) return `SERVES ${min}-${max}`
  if (min != null) return `SERVES ${min}`
  if (max != null) return `SERVES ${max}`
  return null
}

/**
 * The human readout for a priced line — "3 PLATTERS · SERVES 4-6". Platters
 * carry their yield so the PDF / share page / kitchen copy reads correctly.
 */
export function describeLineUnit(line: {
  unit: PricingUnit
  qty: number
  servesMin?: number | null
  servesMax?: number | null
}): string {
  const qty = Math.max(0, Math.round(Number(line.qty) || 0))
  const noun =
    line.unit === 'PER_PERSON'
      ? qty === 1
        ? 'PERSON'
        : 'PEOPLE'
      : line.unit === 'PER_PLATTER'
        ? qty === 1
          ? 'PLATTER'
          : 'PLATTERS'
        : 'EACH'
  const base = `${qty} ${noun}`
  const yieldText = line.unit === 'PER_PLATTER' ? formatLineYield(line.servesMin, line.servesMax) : null
  return yieldText ? `${base} · ${yieldText}` : base
}

/**
 * How many platters to order for a head count — pax ÷ the "serves at least N"
 * yield. Null when either side is missing, so the caller can hide the
 * suggestion rather than guess.
 */
export function suggestPlatterCount(
  pax: number | null | undefined,
  servesMin: number | null | undefined,
): number | null {
  const p = Number(pax)
  const s = Number(servesMin)
  if (!Number.isFinite(p) || p <= 0) return null
  if (!Number.isFinite(s) || s <= 0) return null
  return Math.max(1, Math.ceil(p / s))
}

/**
 * Every priced line across the menu + drinks blocks, merged on
 * `(menuItemId|packageId) + unit`. A line with no unit reads as its product's
 * `pricingMode` (when supplied), else EACH — so the editor's default and the
 * priced result agree.
 */
export function collectPriceableLines(
  blocks: EventBlockLike[] | null | undefined,
  menuItems?: MenuPrice[],
): PriceableLine[] {
  const productById = menuItems ? new Map(menuItems.map((m) => [m.id, m])) : null
  const merged = new Map<string, PriceableLine>()
  for (const block of blocks ?? []) {
    if (!PRICED_BLOCK_TYPES.includes(block.type)) continue
    const items = block.config?.items
    if (!Array.isArray(items)) continue
    for (const raw of items) {
      const it = raw as
        | {
            menuItemId?: unknown
            packageId?: unknown
            qty?: unknown
            unit?: unknown
            servesMin?: unknown
            servesMax?: unknown
            priceDelta?: unknown
          }
        | null
      const menuItemId = typeof it?.menuItemId === 'string' ? it.menuItemId : ''
      const packageId = typeof it?.packageId === 'string' ? it.packageId : ''
      if (!menuItemId && !packageId) continue
      const qtyNum = Number(it?.qty)
      const qty = Number.isFinite(qtyNum) ? Math.max(0, qtyNum) : 0
      const explicitUnit = it?.unit != null ? parsePricingUnit(it.unit) : undefined
      const unit =
        explicitUnit ??
        (menuItemId ? parsePricingUnit(productById?.get(menuItemId)?.pricingMode) : 'EACH')
      const key = `${menuItemId}|${packageId}|${unit}`
      const servesMin = optionalInt(it?.servesMin)
      const servesMax = optionalInt(it?.servesMax)
      const priceDelta = optionalNumber(it?.priceDelta)
      const choices = parseLineChoices((it as { choices?: unknown } | null)?.choices)
      const previous = merged.get(key)
      if (previous) {
        previous.qty += qty
        if (priceDelta != null) previous.priceDelta = round2((previous.priceDelta ?? 0) + priceDelta)
        if (choices) previous.choices = mergeChoices(previous.choices, choices)
        continue
      }
      const line: PriceableLine = { qty, unit }
      if (menuItemId) line.menuItemId = menuItemId
      if (packageId) line.packageId = packageId
      if (servesMin != null) line.servesMin = servesMin
      if (servesMax != null) line.servesMax = servesMax
      if (priceDelta != null) line.priceDelta = priceDelta
      if (choices) line.choices = choices
      merged.set(key, line)
    }
  }
  return [...merged.values()]
}

/**
 * Every priced item merged by product only — the legacy shape (no units).
 * Kept for callers/tests that predate mixed units.
 */
export function collectEventItems(blocks: EventBlockLike[] | null | undefined): PriceableLine[] {
  const merged = new Map<string, number>()
  for (const line of collectPriceableLines(blocks)) {
    if (!line.menuItemId || line.qty <= 0) continue
    merged.set(line.menuItemId, (merged.get(line.menuItemId) ?? 0) + line.qty)
  }
  return [...merged.entries()].map(([menuItemId, qty]) => ({ menuItemId, qty }))
}

function optionalInt(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : undefined
}

function optionalNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/**
 * A tolerant read of the stored `choices` snapshot. Returns `undefined` when
 * the line has no choices (nothing authored — no min/max validation), and an
 * array (possibly empty) when it does. Duplicate picks are collapsed.
 */
export function parseLineChoices(raw: unknown): LineChoice[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: LineChoice[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    const groupId = typeof c.groupId === 'string' ? c.groupId.trim() : ''
    const choiceId = typeof c.choiceId === 'string' ? c.choiceId.trim() : ''
    if (!groupId || !choiceId) continue
    out.push({
      groupId,
      groupName: typeof c.groupName === 'string' && c.groupName.trim() ? c.groupName.trim() : groupId,
      choiceId,
      choiceName: typeof c.choiceName === 'string' && c.choiceName.trim() ? c.choiceName.trim() : choiceId,
      priceDelta: optionalNumber(c.priceDelta) ?? 0,
    })
  }
  return mergeChoices(out)
}

/**
 * Merge choice lists, de-duplicating on `(groupId, choiceId)`. Two identical
 * lines with the same picks must not double the delta or inflate a min/max
 * count; the first occurrence wins.
 */
export function mergeChoices(...lists: (LineChoice[] | null | undefined)[]): LineChoice[] {
  const out: LineChoice[] = []
  const seen = new Set<string>()
  for (const list of lists) {
    for (const choice of list ?? []) {
      const key = `${choice.groupId}|${choice.choiceId}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(choice)
    }
  }
  return out
}

/**
 * The block-level SET MENU PICKS for the bound per-head menu (#192). Stored on
 * a priced block's `packageChoices` so the picks travel with the event and are
 * priced on the package line, never as a second set-menu product line.
 */
export function collectPackageChoices(
  blocks: EventBlockLike[] | null | undefined,
): LineChoice[] {
  const lists: LineChoice[][] = []
  for (const block of blocks ?? []) {
    if (!PRICED_BLOCK_TYPES.includes(block.type)) continue
    const parsed = parseLineChoices(block.config?.packageChoices)
    if (parsed) lists.push(parsed)
  }
  return mergeChoices(...lists)
}

/** Total additive upcharge from a line's picks (included picks are $0). */
export function choicesPriceDelta(choices: LineChoice[] | undefined): number {
  return (choices ?? []).reduce((sum, c) => sum + (Number(c.priceDelta) || 0), 0)
}

/** Days from `fromKey` to `toKey` (both `YYYY-MM-DD`), or null when unparseable. */
export function daysBetweenKeys(fromKey: string, toKey: string): number | null {
  const from = dayNumber(fromKey)
  const to = dayNumber(toKey)
  if (from == null || to == null) return null
  return to - from
}

function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key ?? ''))
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000
}

function effectiveQty(
  line: PriceableLine,
  guestCount: number | null,
  hasGuestCount: boolean,
): number {
  // A supplied guest count (including 0) is authoritative for a per-person
  // line. With no count at all, fall back to the authored count (never drops).
  if (line.unit === 'PER_PERSON' && hasGuestCount) {
    return Math.max(0, Math.round(guestCount as number))
  }
  return line.qty
}

/**
 * Minimum / lead-time / choice-group warnings for one line — shared by
 * `computeEventTotals` and the BEO builder so the editor's soft warning and the
 * priced result can never disagree. Minimums apply only when something is
 * ordered; a supplied guest count of 0 means nothing is ordered.
 */
export function pricingWarnings(input: {
  name: string
  menuItemId?: string
  qty: number
  unit: PricingUnit
  minQty?: number | null
  leadTimeDays?: number | null
  guestCount?: number | null
  eventDate?: string | null
  today?: string | null
  choices?: LineChoice[]
  choiceGroups?: ChoiceGroupLike[]
}): PricingViolation[] {
  const warnings: PricingViolation[] = []
  const guestCount =
    input.guestCount != null && Number.isFinite(Number(input.guestCount))
      ? Number(input.guestCount)
      : null
  const qty =
    input.unit === 'PER_PERSON' && guestCount != null
      ? Math.max(0, Math.round(guestCount))
      : input.qty
  const minimum = optionalInt(input.minQty)
  const leadTimeDays = optionalInt(input.leadTimeDays)

  if (minimum != null && qty > 0 && qty < minimum) {
    warnings.push({
      kind: 'BELOW_MINIMUM',
      name: input.name,
      message: `${input.name}: MINIMUM ${minimum}, ORDERED ${qty}`,
      menuItemId: input.menuItemId,
    })
  }

  if (leadTimeDays != null && leadTimeDays > 0 && input.eventDate && input.today) {
    const days = daysBetweenKeys(input.today, input.eventDate)
    if (days != null && days < leadTimeDays) {
      warnings.push({
        kind: 'INSIDE_LEAD_TIME',
        name: input.name,
        message: `${input.name}: NEEDS ${leadTimeDays} DAYS NOTICE`,
        menuItemId: input.menuItemId,
      })
    }
  }

  // Choice-group picks only apply to a per-person set-menu line, and are only
  // validated when the line carries a `choices` snapshot (an empty array means
  // "authored, nothing picked yet").
  if (input.unit === 'PER_PERSON' && input.choices !== undefined && input.choiceGroups && qty > 0) {
    for (const group of input.choiceGroups) {
      const picks = input.choices.filter((c) => c.groupId === group.id).length
      const min = optionalInt(group.minSelect) ?? 0
      const max = optionalInt(group.maxSelect)
      if (min > 0 && picks < min) {
        warnings.push({
          kind: 'BELOW_MIN_SELECT',
          name: `${input.name} — ${group.name}`,
          message: `${group.name.toUpperCase()}: PICK AT LEAST ${min} (PICKED ${picks})`,
          menuItemId: input.menuItemId,
        })
      }
      if (max != null && picks > max) {
        warnings.push({
          kind: 'ABOVE_MAX_SELECT',
          name: `${input.name} — ${group.name}`,
          message: `${group.name.toUpperCase()}: PICK AT MOST ${max} (PICKED ${picks})`,
          menuItemId: input.menuItemId,
        })
      }
    }
  }

  return warnings
}

/**
 * Price the event. Items with no matching product/package are skipped rather
 * than priced at zero — and are reported in `violations` so the builder can
 * warn before save. Minimums and lead times are reported, never clamped.
 */
export function computeEventTotals(
  blocks: EventBlockLike[] | null | undefined,
  menuItems: MenuPrice[],
  deposit: number | null | undefined,
  options: EventPricingOptions = {},
): EventTotals {
  const byId = new Map(menuItems.map((m) => [m.id, m]))
  const packageById = options.packages
    ? new Map(options.packages.map((p) => [p.id, p]))
    : null
  const hasGuestCount = options.guestCount != null && Number.isFinite(Number(options.guestCount))
  const guestCount = hasGuestCount ? Number(options.guestCount) : null

  const lines: EventPriceLine[] = []
  const violations: PricingViolation[] = []
  const collected = collectPriceableLines(blocks, menuItems)

  // Picks for the bound per-head menu live on the block (`packageChoices`), so
  // they price on the package line and never as a second set-menu product.
  let packageChoices = mergeChoices(options.packageChoices, collectPackageChoices(blocks))
  // Legacy data: a PER_PERSON product line carrying actual picks was the old
  // per-line set menu. Those picks move onto the package (with the line's own
  // upcharge preserved) and the line is not priced again, so the event cannot
  // double-charge. An empty `choices` array is not a set menu — it prices as a
  // normal per-person line.
  const legacySetMenuLines = new Set<PriceableLine>()
  let legacySetMenuPriceDelta = 0
  if (options.package) {
    for (const line of collected) {
      if (line.menuItemId && line.unit === 'PER_PERSON' && line.choices && line.choices.length > 0) {
        legacySetMenuLines.add(line)
        packageChoices = mergeChoices(packageChoices, line.choices)
        legacySetMenuPriceDelta += Number(line.priceDelta) || 0
      }
    }
  }

  // The event's bound PER_PERSON menu is a package line priced per head (#192).
  // A bound menu that has been purged is reported, never priced at $0.
  if (options.missingPackage) {
    violations.push({
      kind: 'MISSING_PACKAGE',
      name: options.missingPackage.name ?? options.missingPackage.id,
      message: 'MENU NO LONGER EXISTS — NOT PRICED',
      packageId: options.missingPackage.id,
    })
  } else if (options.package) {
    const pkg = options.package
    const qty = hasGuestCount ? Math.max(0, Math.round(guestCount as number)) : 0
    const explicitlyLined = collected.some((l) => l.packageId === pkg.id)
    const basePrice = Number(pkg.price)
    if (!explicitlyLined && qty > 0 && Number.isFinite(basePrice)) {
      // Per-head price + the picks' additive upcharges. Picks are included by
      // default; a min/max breach is reported, never clamped.
      const unitPrice =
        basePrice + legacySetMenuPriceDelta + choicesPriceDelta(packageChoices)
      violations.push(
        ...pricingWarnings({
          name: pkg.name,
          menuItemId: pkg.id,
          qty,
          unit: 'PER_PERSON',
          guestCount,
          eventDate: options.eventDate,
          today: options.today,
          choices: packageChoices,
          choiceGroups: options.choiceGroups,
        }),
      )
      const line: EventPriceLine = {
        menuItemId: pkg.id,
        packageId: pkg.id,
        name: pkg.name,
        qty,
        unit: 'PER_PERSON',
        unitPrice,
        total: round2(unitPrice * qty),
      }
      if (packageChoices.length > 0) line.choices = packageChoices
      lines.push(line)
    }
  }

  for (const item of collected) {
    // A legacy per-line set menu is folded into the package line above.
    if (legacySetMenuLines.has(item)) continue

    const unit = item.unit ?? 'EACH'
    const isPackageLine = !item.menuItemId && !!item.packageId
    const perPersonChoices = unit === 'PER_PERSON' ? item.choices : undefined

    if (isPackageLine) {
      const pkg = packageById?.get(item.packageId as string)
      if (!pkg) {
        // Only report a missing package when the caller told us which packages
        // exist (otherwise the caller simply doesn't price packages).
        if (packageById) {
          violations.push({
            kind: 'MISSING_PACKAGE',
            name: item.packageId as string,
            message: 'PACKAGE NO LONGER EXISTS — LINE NOT PRICED',
            packageId: item.packageId as string,
          })
        }
        continue
      }
      const qty = effectiveQty(item, guestCount, hasGuestCount)
      if (qty <= 0) continue
      const choices = mergeChoices(
        item.choices,
        item.packageId === options.package?.id ? packageChoices : undefined,
      )
      const choiceDelta = unit === 'PER_PERSON' ? choicesPriceDelta(choices) : 0
      const unitPrice =
        (Number(pkg.price) || 0) +
        (Number(item.priceDelta) || 0) +
        choiceDelta
      violations.push(
        ...pricingWarnings({
          name: pkg.name,
          menuItemId: pkg.id,
          qty,
          unit,
          guestCount,
          eventDate: options.eventDate,
          today: options.today,
          choices: unit === 'PER_PERSON' ? choices : undefined,
          choiceGroups: options.choiceGroups,
        }),
      )
      const line: EventPriceLine = {
        menuItemId: pkg.id,
        packageId: pkg.id,
        name: pkg.name,
        qty,
        unit,
        unitPrice,
        total: round2(unitPrice * qty),
      }
      if (unit === 'PER_PERSON' && choices.length > 0) line.choices = choices
      lines.push(line)
      continue
    }

    // Resolve the quantity first — a zero-quantity line against a purged
    // product is not an order, so it is skipped without a violation.
    const qty = effectiveQty(item, guestCount, hasGuestCount)
    if (qty <= 0) continue

    const product = byId.get(item.menuItemId as string)
    if (!product) {
      violations.push({
        kind: 'MISSING_ITEM',
        name: item.menuItemId as string,
        message: 'PRODUCT NO LONGER EXISTS — LINE NOT PRICED',
        menuItemId: item.menuItemId as string,
      })
      continue
    }

    // A grouping package that has been purged cannot be validated — skip and
    // tell the operator rather than pricing a line that no longer belongs.
    if (item.packageId && packageById && !packageById.has(item.packageId)) {
      violations.push({
        kind: 'MISSING_PACKAGE',
        name: item.packageId,
        message: 'PACKAGE NO LONGER EXISTS — LINE NOT PRICED',
        menuItemId: product.id,
        packageId: item.packageId,
      })
      continue
    }

    // Choice upcharges only apply to a per-person line (a stored snapshot of
    // manual upcharges; the only non-live cash fact).
    const unitPrice =
      (Number(product.price) || 0) +
      (Number(item.priceDelta) || 0) +
      (unit === 'PER_PERSON' ? choicesPriceDelta(perPersonChoices) : 0)
    const servesMin = item.servesMin ?? optionalInt(product.servesMin) ?? undefined
    const servesMax = item.servesMax ?? optionalInt(product.servesMax) ?? undefined
    const minimum = optionalInt(product.minQty) ?? undefined
    const leadTimeDays = optionalInt(product.leadTimeDays) ?? undefined

    violations.push(
      ...pricingWarnings({
        name: product.name,
        menuItemId: product.id,
        qty: item.qty,
        unit,
        minQty: minimum,
        leadTimeDays,
        guestCount,
        eventDate: options.eventDate,
        today: options.today,
        choices: perPersonChoices,
        choiceGroups: options.choiceGroups,
      }),
    )

    const line: EventPriceLine = {
      menuItemId: product.id,
      name: product.name,
      qty,
      unit,
      unitPrice,
      total: round2(unitPrice * qty),
    }
    if (item.packageId) line.packageId = item.packageId
    if (servesMin != null) line.servesMin = servesMin
    if (servesMax != null) line.servesMax = servesMax
    if (minimum != null) line.minimum = minimum
    if (leadTimeDays != null) line.leadTimeDays = leadTimeDays
    if (perPersonChoices && perPersonChoices.length > 0) line.choices = perPersonChoices
    lines.push(line)
  }

  const subtotal = round2(lines.reduce((sum, l) => sum + l.total, 0))
  const byUnit: Record<PricingUnit, number> = { EACH: 0, PER_PERSON: 0, PER_PLATTER: 0 }
  for (const line of lines) byUnit[line.unit] = round2(byUnit[line.unit] + line.total)
  const dep = round2(Math.max(0, Number(deposit) || 0))
  return {
    lines,
    subtotal,
    deposit: dep,
    balance: round2(subtotal - dep),
    byUnit,
    violations,
  }
}
