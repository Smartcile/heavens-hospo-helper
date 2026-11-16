// Pure member-name helpers: whitespace, capitalisation, duplicate surname
// tokens, family surnames and membership-number parsing. No Prisma, no Node.

const PARTICLES = new Set([
  'van',
  'von',
  'de',
  'der',
  'den',
  'da',
  'du',
  'le',
  'la',
  'ten',
  'dos',
  'das',
  'del',
])

export function normaliseSpaces(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function isAllCaps(word: string): boolean {
  return word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)
}

function isAllLower(word: string): boolean {
  return word.length > 1 && word === word.toLowerCase()
}

function capitaliseWord(word: string): string {
  if (!word) return ''
  if (isAllCaps(word) || isAllLower(word)) {
    const lower = word.toLowerCase()
    if (lower.length > 2 && lower.startsWith('mc')) {
      return `Mc${lower[2].toUpperCase()}${lower.slice(3)}`
    }
    return lower[0].toUpperCase() + lower.slice(1)
  }
  // Mixed-case input already carries intentional capitals (MacLaren, FitzGerald).
  return word[0].toUpperCase() + word.slice(1)
}

function capitalisePart(part: string, opts: { surname: boolean; particleLower: boolean }): string {
  if (!part) return ''
  if (opts.particleLower) {
    const lower = part.toLowerCase()
    // Particles stay lower-case in a multi-part surname ("van den Anker"),
    // but a single-token surname keeps its capital ("De").
    if (PARTICLES.has(lower)) return lower
  }
  if (isAllCaps(part) || isAllLower(part)) return capitaliseWord(part)
  // A mixed-case name with a trailing all-caps run (MacLAREN, FitzGERALD) is
  // almost always shouting; keep the intentional prefix and title the rest.
  const trailingCaps = part.match(/^([A-Z][a-z]+)([A-Z]+)$/)
  if (trailingCaps) return trailingCaps[1] + capitaliseWord(trailingCaps[2])
  const hasInternalCaps = /[A-Z]/.test(part.slice(1))
  if (hasInternalCaps) return part[0].toUpperCase() + part.slice(1)
  return capitaliseWord(part)
}

/** Title-case a name. `surname` lower-cases particles (van/de/der...). */
export function titleCaseName(value: string | null | undefined, opts: { surname?: boolean } = {}): string {
  const surname = opts.surname === true
  const text = normaliseSpaces(value)
  if (!text) return ''
  const particleLower = surname && text.split(' ').length > 1

  return text
    .split(' ')
    .map((token) => {
      const hyphenParts = token.split('-')
      return hyphenParts
        .map((part) => {
          const apostropheParts = part.split("'")
          return apostropheParts
            .map((piece, index) =>
              capitalisePart(piece, {
                surname: surname && index === 0,
                particleLower: particleLower && index === 0,
              }),
            )
            .join("'")
        })
        .join('-')
    })
    .join(' ')
}

export function nameMatchKey(value: string | null | undefined): string {
  return normaliseSpaces(value).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function surnameTokens(lastName: string): string[] {
  const parsed = parseFamilyLastName(lastName)
  return parsed.surnames.flatMap((s) => s.split(' ')).map(nameMatchKey).filter(Boolean)
}

/**
 * Remove a repeated surname from the given name (`Sue JOHN` + `JOHN` -> `Sue`,
 * `Jamie HUTCHENS` + `HUTCHENS (Family)` -> `Jamie`). Also collapses repeated
 * consecutive tokens (`JOHN JOHN` -> `John`). Returns the removed tokens so the
 * preview can show what happened.
 */
export function dedupeSurnameFromFirstName(
  firstName: string,
  lastName: string,
): { firstName: string; removed: string[] } {
  const tokens = normaliseSpaces(firstName).split(' ').filter(Boolean)
  const keys = new Set(surnameTokens(lastName))
  const removed: string[] = []

  const collapsed: string[] = []
  for (const token of tokens) {
    if (collapsed.length > 0 && nameMatchKey(collapsed[collapsed.length - 1]) === nameMatchKey(token)) {
      removed.push(token)
      continue
    }
    collapsed.push(token)
  }

  while (collapsed.length > 1) {
    const last = collapsed[collapsed.length - 1]
    if (keys.has(nameMatchKey(last))) {
      removed.push(collapsed.pop() as string)
    } else {
      break
    }
  }

  const cleaned = collapsed.join(' ')
  return {
    firstName: titleCaseName(cleaned) || titleCaseName(tokens[0] ?? ''),
    removed,
  }
}

export interface ParsedFamilyLastName {
  isFamily: boolean
  surnames: string[]
  hasMarker: boolean
}

/** Pull surnames out of `Baff (Cree Family)`, `Hume (Family`, `Baff/Cree`. */
export function parseFamilyLastName(lastName: string | null | undefined): ParsedFamilyLastName {
  const raw = normaliseSpaces(lastName)
  if (!raw) return { isFamily: false, surnames: [], hasMarker: false }

  const hasMarker = /\bfamily\b/i.test(raw)
  const parentheticals = Array.from(raw.matchAll(/\(([^)]*)/g)).map((m) => m[1] ?? '')
  const outer = normaliseSpaces(raw.replace(/\([^)]*\)?/g, ' '))
  const fragments: string[] = []

  for (const part of [outer, ...parentheticals]) {
    const withoutMarker = part.replace(/\bfamily\b/gi, ' ')
    for (const piece of withoutMarker.split(/[\/&,]|\band\b/gi)) {
      const cleaned = normaliseSpaces(piece)
      if (cleaned) fragments.push(cleaned)
    }
  }

  const seen = new Set<string>()
  const surnames: string[] = []
  for (const fragment of fragments) {
    const cleaned = titleCaseName(fragment, { surname: true })
    const key = nameMatchKey(cleaned)
    if (!key || seen.has(key)) continue
    seen.add(key)
    surnames.push(cleaned)
  }

  return {
    isFamily: hasMarker || surnames.length > 1,
    surnames,
    hasMarker,
  }
}

/** Build the SwiftPOS family surname, e.g. `Baff/Cree (Family)`. */
export function buildFamilyLastName(surnames: string[]): string {
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const surname of surnames) {
    for (const part of normaliseSpaces(surname).split('/')) {
      const value = titleCaseName(part, { surname: true })
      const key = nameMatchKey(value)
      if (!key || seen.has(key)) continue
      seen.add(key)
      cleaned.push(value)
    }
  }
  if (cleaned.length === 0) return ''
  return `${cleaned.join('/')} (Family)`
}

export interface ParsedMembershipNumber {
  raw: string
  base: string
  suffix: string
  isFamily: boolean
}

/**
 * Normalise a SwiftPOS member number. `444.1`/`444.2` collapse to base `444`;
 * a trailing dot (`837.`) is not a family suffix. Non-numeric values are null.
 */
export function normaliseMembershipNumber(value: string | null | undefined): ParsedMembershipNumber | null {
  const raw = normaliseSpaces(value)
  if (!raw) return null
  const compact = raw.replace(/\s+/g, '').replace(/[,\u2013\u2014]+$/g, '')
  const match = compact.match(/^(\d+)(?:\.(\d+))?\.?$/)
  if (!match) return null
  const base = match[1]
  const suffix = match[2] ?? ''
  return { raw, base, suffix, isFamily: suffix !== '' }
}

/** Split a display name into first/last without inventing data. */
export function splitDisplayName(name: string | null | undefined): { firstName: string; lastName: string } {
  const text = normaliseSpaces(name)
  if (!text) return { firstName: '', lastName: '' }
  if (text.includes(',')) {
    const [lastName, ...rest] = text.split(',')
    return {
      firstName: normaliseSpaces(rest.join(',')),
      lastName: normaliseSpaces(lastName),
    }
  }
  const tokens = text.split(' ')
  if (tokens.length === 1) return { firstName: tokens[0], lastName: '' }
  const lastName = tokens.pop() as string
  return { firstName: tokens.join(' '), lastName }
}

/**
 * The single active/inactive rule. HubSpot's taxonomy never reaches the
 * database; this only answers "did the export say this membership is retired?".
 * `Resign Pending` is still active until the resignation takes effect.
 */
export function isInactiveStatus(status: string | null | undefined): boolean {
  const value = normaliseSpaces(status).toLowerCase()
  if (!value) return false
  if (value.includes('resign pending')) return false
  return /(resign|deceased|cancel|expire|inactive|retired|former|removed)/.test(value)
}
