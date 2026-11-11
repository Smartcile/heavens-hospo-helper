// Order product-option choices — the pure, Prisma-free brain shared by the
// admin order forms, the order views and the API routes.
//
// A line stores a SNAPSHOT of the customer's choices, not a join:
//   [{ groupId, groupName, choiceId, choiceName, priceDelta }]
// so editing a product's option group later never rewrites order history.
// The server re-validates a submitted choice against the product's LIVE groups
// and folds the live `priceDelta` into the stored line price.

import type { MenuOptionGroup } from './menu-options'
import { normaliseOptionName, normalisePriceDelta } from './menu-options'

export interface OrderLineOption {
  groupId: string
  groupName: string
  choiceId: string
  choiceName: string
  priceDelta: number
}

export interface OptionViolation {
  groupId?: string
  groupName?: string
  /** Plain-English reason shown to the operator. */
  message: string
}

export interface OptionValidationResult {
  violations: OptionViolation[]
  /** The live-resolved snapshot to store on the line (defaults applied). */
  resolved: OrderLineOption[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function optionKey(groupId: string, groupName: string, choiceId: string): string {
  // groupId is authoritative; fall back to the name for legacy snapshots that
  // predate ids (they still validate by name against the live group).
  return `${groupId || normaliseOptionName(groupName)}:${choiceId}`
}

/** Sanitise a stored/submitted snapshot: uppercase names, clamp deltas, dedupe. */
export function normaliseOrderOptions(raw: unknown): OrderLineOption[] {
  if (!Array.isArray(raw)) return []
  const out: OrderLineOption[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const groupId = typeof o.groupId === 'string' ? o.groupId.trim() : ''
    const groupName = normaliseOptionName(o.groupName)
    const choiceId = typeof o.choiceId === 'string' ? o.choiceId.trim() : ''
    const choiceName = normaliseOptionName(o.choiceName)
    if (!choiceId || !choiceName) continue

    const key = optionKey(groupId, groupName, choiceId)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      groupId,
      groupName,
      choiceId,
      choiceName,
      priceDelta: normalisePriceDelta(o.priceDelta),
    })
  }

  return out
}

/** Sum of the chosen upcharges, rounded to cents. */
export function optionPriceDelta(options: readonly Pick<OrderLineOption, 'priceDelta'>[]): number {
  return round2(options.reduce((sum, o) => sum + (Number(o.priceDelta) || 0), 0))
}

/** "SIDE: FRIES, SALAD · DRINK: COKE" — the display summary for a line. */
export function describeOrderLineOptions(options: readonly OrderLineOption[]): string {
  const groups = new Map<string, { name: string; choices: string[] }>()

  for (const option of options) {
    const key = option.groupId || normaliseOptionName(option.groupName)
    const group = groups.get(key) ?? { name: option.groupName || 'OPTIONS', choices: [] }
    group.choices.push(option.choiceName)
    groups.set(key, group)
  }

  return [...groups.values()]
    .map((g) => `${g.name}: ${g.choices.join(', ')}`)
    .join(' · ')
}

/** Order a snapshot by the live group order, then choice order. */
export function sortOrderOptions(
  groups: readonly MenuOptionGroup[],
  options: readonly OrderLineOption[],
): OrderLineOption[] {
  const groupOrder = new Map<string, number>()
  groups.forEach((g, i) => {
    if (g.id) groupOrder.set(g.id, i)
  })

  const choiceOrder = new Map<string, number>()
  for (const g of groups) {
    g.choices.forEach((c, i) => {
      if (c.id) choiceOrder.set(c.id, i)
    })
  }

  return [...options].sort((a, b) => {
    const ga = groupOrder.get(a.groupId)
    const gb = groupOrder.get(b.groupId)
    if (ga != null && gb != null && ga !== gb) return ga - gb
    if (ga != null && gb == null) return -1
    if (ga == null && gb != null) return 1
    const ca = choiceOrder.get(a.choiceId)
    const cb = choiceOrder.get(b.choiceId)
    if (ca != null && cb != null) return ca - cb
    return 0
  })
}

/**
 * Toggle one choice in a selection.
 *
 * - single-select (`maxSelect === 1`): picking a choice replaces the group's
 *   current choice; picking the current one is a no-op (a required group must
 *   keep at least one).
 * - multi-select: picks add up to `maxSelect`, then further picks are ignored;
 *   picking a selected choice removes it.
 */
export function toggleOptionSelection(
  groups: readonly MenuOptionGroup[],
  current: readonly OrderLineOption[],
  groupId: string,
  choiceId: string,
): OrderLineOption[] {
  const group = groups.find((g) => g.id === groupId)
  if (!group) return [...current]

  const choice = group.choices.find((c) => c.id === choiceId)
  if (!choice) return [...current]

  const groupSelection = current.filter((o) => o.groupId === groupId)
  const isSelected = groupSelection.some((o) => o.choiceId === choiceId)
  const next: OrderLineOption[] = current.filter((o) => o.groupId !== groupId)

  if (group.maxSelect === 1) {
    if (isSelected) return sortOrderOptions(groups, [...current])
    next.push(toOption(group, choice))
  } else if (isSelected) {
    next.push(...groupSelection.filter((o) => o.choiceId !== choiceId))
  } else if (groupSelection.length < group.maxSelect) {
    next.push(...groupSelection, toOption(group, choice))
  } else {
    // Already at the cap — leave the selection unchanged.
    return sortOrderOptions(groups, [...current])
  }

  return sortOrderOptions(groups, next)
}

function toOption(
  group: MenuOptionGroup,
  choice: { id?: string; name: string; priceDelta: number },
): OrderLineOption {
  return {
    groupId: group.id as string,
    groupName: normaliseOptionName(group.name),
    choiceId: choice.id as string,
    choiceName: normaliseOptionName(choice.name),
    priceDelta: normalisePriceDelta(choice.priceDelta),
  }
}

/**
 * Validate a submitted selection against the product's LIVE option groups.
 *
 * Rules:
 * - every selection must name a live group + choice (unknown = violation);
 * - a single-select group may hold at most one choice;
 * - `minSelect`/`maxSelect` are enforced per group;
 * - a group with no selection is filled from its single default choice (a
 *   default is the author's "pre-selected" intent); more than one default on a
 *   single-select group is a data error and is reported.
 *
 * Returns the live-resolved snapshot (live ids/names/price deltas) to store.
 */
export function validateOptionSelection(
  groups: readonly MenuOptionGroup[],
  selected: unknown,
): OptionValidationResult {
  const incoming = normaliseOrderOptions(selected)
  const violations: OptionViolation[] = []

  const liveGroups = groups.filter((g): g is MenuOptionGroup & { id: string } => !!g.id)
  const byId = new Map(liveGroups.map((g) => [g.id, g]))
  const byName = new Map(liveGroups.map((g) => [normaliseOptionName(g.name), g]))

  const pickedByGroup = new Map<string, OrderLineOption[]>()

  for (const selection of incoming) {
    const group =
      (selection.groupId ? byId.get(selection.groupId) : undefined) ??
      byName.get(normaliseOptionName(selection.groupName))

    if (!group) {
      violations.push({
        groupId: selection.groupId || undefined,
        groupName: selection.groupName || undefined,
        message: `UNKNOWN OPTION GROUP: ${selection.groupName || selection.groupId || '—'}`,
      })
      continue
    }

    const choice =
      group.choices.find((c) => c.id === selection.choiceId) ??
      group.choices.find((c) => normaliseOptionName(c.name) === normaliseOptionName(selection.choiceName))

    if (!choice || !choice.id) {
      violations.push({
        groupId: group.id,
        groupName: group.name,
        message: `${group.name} — UNKNOWN OPTION: ${selection.choiceName || selection.choiceId || '—'}`,
      })
      continue
    }

    const list = pickedByGroup.get(group.id) ?? []
    list.push(toOption(group, choice))
    pickedByGroup.set(group.id, list)
  }

  const resolved: OrderLineOption[] = []

  for (const group of liveGroups) {
    let picks = pickedByGroup.get(group.id) ?? []

    if (picks.length === 0) {
      const defaults = group.choices.filter((c) => c.isDefault && c.id)
      if (defaults.length === 1) {
        picks = [toOption(group, defaults[0])]
      } else if (defaults.length > 1) {
        violations.push({
          groupId: group.id,
          groupName: group.name,
          message: `${group.name} — ONLY ONE DEFAULT CHOICE IS ALLOWED`,
        })
      }
    }

    if (picks.length < group.minSelect) {
      violations.push({
        groupId: group.id,
        groupName: group.name,
        message: `${group.name} — CHOOSE AT LEAST ${group.minSelect}`,
      })
    }
    if (picks.length > group.maxSelect) {
      violations.push({
        groupId: group.id,
        groupName: group.name,
        message: `${group.name} — CHOOSE AT MOST ${group.maxSelect}`,
      })
    }

    const orderedChoices = group.choices
      .map((c) => c.id)
      .filter((id): id is string => !!id)
    picks.sort((a, b) => orderedChoices.indexOf(a.choiceId) - orderedChoices.indexOf(b.choiceId))
    resolved.push(...picks)
  }

  return { violations, resolved }
}
