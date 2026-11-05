// Product option groups — the pure, Prisma-free brain shared by the editor,
// the menu builder/preview and the server. Options live on the PRODUCT
// (`MenuItemOptionGroup` → `MenuItemOptionChoice`) so every menu the product is
// on shares the same choices. See MENUS.md.
//
// Upcharges are additive only: `priceDelta >= 0`. Selection is described with
// `minSelect`/`maxSelect` (0/1 = optional single, 1/1 = required single,
// 1/3 = choose up to three). At most one default choice is allowed when the
// group is single-select (`maxSelect === 1`).

export interface MenuOptionChoice {
  id?: string
  name: string
  priceDelta: number
  isDefault: boolean
  sortOrder?: number
}

export interface MenuOptionGroup {
  id?: string
  name: string
  minSelect: number
  maxSelect: number
  sortOrder?: number
  choices: MenuOptionChoice[]
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[^0-9.+-]/g, '')
    if (!cleaned) return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toInteger(raw: unknown): number | null {
  const n = toNumber(raw)
  return n == null ? null : Math.trunc(n)
}

/** Trim, collapse whitespace and uppercase a group/choice name. */
export function normaliseOptionName(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
}

/** A price delta is an upcharge only — negative or invalid values become 0. */
export function normalisePriceDelta(raw: unknown): number {
  const n = toNumber(raw)
  if (n == null || n <= 0) return 0
  return Math.round(n * 100) / 100
}

function normaliseChoice(raw: unknown): MenuOptionChoice | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as {
    id?: unknown
    name?: unknown
    priceDelta?: unknown
    delta?: unknown
    upcharge?: unknown
    isDefault?: unknown
  }
  const name = normaliseOptionName(c.name)
  if (!name) return null
  return {
    ...(typeof c.id === 'string' && c.id ? { id: c.id } : {}),
    name,
    priceDelta: normalisePriceDelta(c.priceDelta ?? c.delta ?? c.upcharge),
    isDefault: c.isDefault === true,
  }
}

/**
 * Sanitise an incoming option-group list. Names are uppercased, price deltas
 * are clamped to non-negative money and sortOrder is the array order. Blank
 * groups/choices and duplicate names (the unique keys) are dropped.
 */
export function normaliseOptionGroups(raw: unknown): MenuOptionGroup[] {
  if (!Array.isArray(raw)) return []
  const groups: MenuOptionGroup[] = []
  const seenGroups = new Set<string>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const g = item as {
      id?: unknown
      name?: unknown
      minSelect?: unknown
      min?: unknown
      maxSelect?: unknown
      max?: unknown
      choices?: unknown
    }
    const name = normaliseOptionName(g.name)
    if (!name || seenGroups.has(name)) continue
    seenGroups.add(name)

    const choices: MenuOptionChoice[] = []
    const seenChoices = new Set<string>()
    if (Array.isArray(g.choices)) {
      for (const rawChoice of g.choices) {
        const choice = normaliseChoice(rawChoice)
        if (!choice || seenChoices.has(choice.name)) continue
        seenChoices.add(choice.name)
        choices.push({ ...choice, sortOrder: choices.length })
      }
    }

    const min = toInteger(g.minSelect ?? g.min)
    const max = toInteger(g.maxSelect ?? g.max)
    groups.push({
      ...(typeof g.id === 'string' && g.id ? { id: g.id } : {}),
      name,
      minSelect: min ?? 0,
      maxSelect: max ?? 1,
      sortOrder: groups.length,
      choices,
    })
  }

  return groups
}

/** Validate one normalised group. Returns an empty array when valid. */
export function validateOptionGroup(group: MenuOptionGroup): string[] {
  const errors: string[] = []
  const label = group.name ? group.name : 'OPTION GROUP'

  if (!group.name) errors.push('OPTION GROUP NAME IS REQUIRED')
  if (!Number.isInteger(group.minSelect) || group.minSelect < 0) {
    errors.push(`${label} — MIN SELECT MUST BE 0 OR MORE`)
  }
  if (!Number.isInteger(group.maxSelect) || group.maxSelect < 1) {
    errors.push(`${label} — MAX SELECT MUST BE AT LEAST 1`)
  }
  if (group.minSelect > group.maxSelect) {
    errors.push(`${label} — MIN SELECT CANNOT EXCEED MAX SELECT`)
  }
  if (group.choices.length === 0) {
    errors.push(`${label} — ADD AT LEAST ONE CHOICE`)
  } else if (group.maxSelect > group.choices.length) {
    errors.push(`${label} — MAX SELECT CANNOT EXCEED THE NUMBER OF CHOICES`)
  }
  for (const choice of group.choices) {
    if (!choice.name) errors.push(`${label} — EVERY CHOICE NEEDS A NAME`)
    if (!Number.isFinite(choice.priceDelta) || choice.priceDelta < 0) {
      errors.push(`${label} — UPCHARGES CANNOT BE NEGATIVE`)
    }
  }
  if (group.maxSelect === 1 && group.choices.filter((c) => c.isDefault).length > 1) {
    errors.push(`${label} — ONLY ONE DEFAULT CHOICE IS ALLOWED`)
  }

  return errors
}

/** Validate every group, flattened into one error list. */
export function validateOptionGroups(groups: MenuOptionGroup[]): string[] {
  return groups.flatMap(validateOptionGroup)
}

/** "OPTIONAL" / "CHOOSE 1" / "CHOOSE 1–2" / "UP TO 3" — the selection rule. */
export function describeOptionRule(group: { minSelect: number; maxSelect: number }): string {
  if (group.minSelect === 0 && group.maxSelect === 1) return 'OPTIONAL'
  if (group.minSelect === group.maxSelect) return `CHOOSE ${group.maxSelect}`
  if (group.minSelect === 0) return `UP TO ${group.maxSelect}`
  return `CHOOSE ${group.minSelect}–${group.maxSelect}`
}

/** "SIDE (CHOOSE 1)" — the group heading used in the preview/editor. */
export function describeOptionGroup(group: { name: string; minSelect: number; maxSelect: number }): string {
  return `${group.name || 'UNTITLED'} (${describeOptionRule(group)})`
}

/** "+$3.00" for an upcharge, "$0.00" when included. */
export function formatPriceDelta(delta: number): string {
  const n = Number(delta)
  const value = Number.isFinite(n) ? n : 0
  const sign = value > 0 ? '+' : ''
  return `${sign}$${value.toFixed(2)}`
}

/** "FRIES $0.00 · SALAD $0.00 · FRIES + SALAD +$3.00" for a preview row. */
export function summariseOptionChoices(group: { choices: MenuOptionChoice[] }): string {
  return group.choices.map((c) => `${c.name} ${formatPriceDelta(c.priceDelta)}`).join(' · ')
}

/** The pre-selected choice in a group, if the author marked one. */
export function defaultOptionChoice<T extends { choices: MenuOptionChoice[] }>(group: T): MenuOptionChoice | null {
  return group.choices.find((c) => c.isDefault) ?? null
}
