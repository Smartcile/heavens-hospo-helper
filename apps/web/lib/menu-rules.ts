/*
 * Menu ordering rules.
 *
 * Two independent levels, both of which real catering menus use:
 *   - menu level  — the headcount range the menu is offered for
 *                   ("EVENT CATERING, 20–150 people")
 *   - item level  — quantity limits on an individual item *if it is ordered*
 *                   ("the cold platter serves 20, minimum 1, max 8")
 *
 * `minQty` deliberately does not force an item onto every order. It is the
 * floor once you take any at all — treating it as "must order" would make it
 * impossible to place an order that skips the item.
 *
 * Pure: no DB access, so the same rules run on the server when saving and in
 * the browser while the operator is still typing.
 */

export interface MenuRules {
  name: string
  minPax?: number | null
  maxPax?: number | null
}

export interface MenuItemRules {
  menuItemId: string
  name: string
  minQty?: number | null
  maxQty?: number | null
}

export interface OrderLine {
  menuItemId: string
  qty: number
}

export type ViolationKind =
  | 'PAX_BELOW_MIN'
  | 'PAX_ABOVE_MAX'
  | 'QTY_BELOW_MIN'
  | 'QTY_ABOVE_MAX'
  | 'ITEM_NOT_ON_MENU'

export interface Violation {
  kind: ViolationKind
  message: string
  menuItemId?: string
}

export function validateOrderAgainstMenu(
  menu: MenuRules,
  itemRules: MenuItemRules[],
  lines: OrderLine[],
  partySize: number | null | undefined,
): Violation[] {
  const violations: Violation[] = []

  // ── Menu level ──
  // Only checked when a party size is known; an unknown headcount is not a
  // violation, it is just missing information.
  if (partySize != null) {
    if (menu.minPax != null && partySize < menu.minPax) {
      violations.push({
        kind: 'PAX_BELOW_MIN',
        message: `${menu.name} REQUIRES AT LEAST ${menu.minPax} GUESTS (ORDER HAS ${partySize})`,
      })
    }
    if (menu.maxPax != null && partySize > menu.maxPax) {
      violations.push({
        kind: 'PAX_ABOVE_MAX',
        message: `${menu.name} ALLOWS AT MOST ${menu.maxPax} GUESTS (ORDER HAS ${partySize})`,
      })
    }
  }

  // ── Item level ──
  const rulesById = new Map(itemRules.map((r) => [r.menuItemId, r]))

  // Combine duplicate lines for the same item first — two lines of 5 satisfy a
  // minimum of 10, and checking them separately would wrongly reject the order.
  const totals = new Map<string, number>()
  for (const line of lines) {
    totals.set(line.menuItemId, (totals.get(line.menuItemId) ?? 0) + line.qty)
  }

  for (const [menuItemId, qty] of totals) {
    const rule = rulesById.get(menuItemId)

    if (!rule) {
      violations.push({
        kind: 'ITEM_NOT_ON_MENU',
        message: `ITEM IS NOT ON ${menu.name}`,
        menuItemId,
      })
      continue
    }

    // Zero/negative means "not ordered" — limits do not apply.
    if (qty <= 0) continue

    if (rule.minQty != null && qty < rule.minQty) {
      violations.push({
        kind: 'QTY_BELOW_MIN',
        message: `${rule.name} HAS A MINIMUM OF ${rule.minQty} (ORDERED ${qty})`,
        menuItemId,
      })
    }
    if (rule.maxQty != null && qty > rule.maxQty) {
      violations.push({
        kind: 'QTY_ABOVE_MAX',
        message: `${rule.name} HAS A MAXIMUM OF ${rule.maxQty} (ORDERED ${qty})`,
        menuItemId,
      })
    }
  }

  return violations
}

/** True when the menu can be offered to a party of this size. */
export function menuAllowsPartySize(
  menu: MenuRules,
  partySize: number | null | undefined,
): boolean {
  if (partySize == null) return true
  if (menu.minPax != null && partySize < menu.minPax) return false
  if (menu.maxPax != null && partySize > menu.maxPax) return false
  return true
}

/** Human-readable range for a menu card, e.g. "20–150 PAX". */
export function describePaxRange(menu: MenuRules): string | null {
  const { minPax, maxPax } = menu
  if (minPax == null && maxPax == null) return null
  if (minPax != null && maxPax != null) return `${minPax}–${maxPax} PAX`
  if (minPax != null) return `${minPax}+ PAX`
  return `UP TO ${maxPax} PAX`
}
