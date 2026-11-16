// Pure customer-database group helpers. Client-safe: no Prisma, no Node.

export type CustomerGroupKind = 'MEMBER_DATABASE' | 'GIFT_CARD'

export type CustomerGroupArea =
  | 'CUSTOMERS'
  | 'BOOKINGS'
  | 'ORDERS'
  | 'EVENTS'
  | 'PARKING'
  | 'GIFT_CARDS'

export const CUSTOMER_GROUP_AREAS: { id: CustomerGroupArea; label: string }[] = [
  { id: 'CUSTOMERS', label: 'CUSTOMERS' },
  { id: 'BOOKINGS', label: 'BOOKINGS' },
  { id: 'ORDERS', label: 'ORDERS' },
  { id: 'EVENTS', label: 'EVENTS' },
  { id: 'PARKING', label: 'PARKING' },
  { id: 'GIFT_CARDS', label: 'GIFT CARDS' },
]

export const ALL_CUSTOMER_GROUP_AREAS = CUSTOMER_GROUP_AREAS.map((a) => a.id)

export const DEFAULT_GROUP_AREAS: CustomerGroupArea[] = ['CUSTOMERS', 'BOOKINGS', 'ORDERS']
export const GIFT_CARD_GROUP_AREAS: CustomerGroupArea[] = ['CUSTOMERS', 'GIFT_CARDS']

export const GIFT_CARD_GROUP_NAME = 'GIFT CARDS'
export const GIFT_CARD_GROUP_SLUG = 'gift-cards'

export interface SwiftPosMemberMapping {
  typeActive: number
  statusActive: number
  typeRemoved: number
  statusRemoved: number
  exportEncoding: string
}

export const DEFAULT_SWIFTPOS_MEMBER_MAPPING: SwiftPosMemberMapping = {
  typeActive: 3,
  statusActive: 1,
  typeRemoved: 9,
  statusRemoved: 0,
  exportEncoding: 'UTF8_BOM',
}

export interface CustomerGroupInput {
  name?: unknown
  slug?: unknown
  kind?: unknown
  description?: unknown
  colour?: unknown
  isActive?: unknown
  sortOrder?: unknown
  areas?: unknown
  parkingTypeId?: unknown
  swiftPosTypeActive?: unknown
  swiftPosStatusActive?: unknown
  swiftPosTypeRemoved?: unknown
  swiftPosStatusRemoved?: unknown
  exportEncoding?: unknown
}

export interface NormalisedCustomerGroup {
  name: string
  slug: string
  kind: CustomerGroupKind
  description: string | null
  colour: string | null
  isActive: boolean
  sortOrder: number
  areas: CustomerGroupArea[]
  parkingTypeId: string | null
  mapping: SwiftPosMemberMapping
}

export type NormaliseGroupResult =
  | { ok: true; value: NormalisedCustomerGroup }
  | { ok: false; error: string }

export function normaliseGroupSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function isCustomerGroupArea(value: unknown): value is CustomerGroupArea {
  return typeof value === 'string' && ALL_CUSTOMER_GROUP_AREAS.includes(value as CustomerGroupArea)
}

export function normaliseAreas(value: unknown, fallback: CustomerGroupArea[] = DEFAULT_GROUP_AREAS): CustomerGroupArea[] {
  if (!Array.isArray(value)) return [...fallback]
  const seen = new Set<CustomerGroupArea>()
  for (const raw of value) {
    const area = String(raw).trim().toUpperCase()
    if (isCustomerGroupArea(area)) seen.add(area)
  }
  if (seen.size === 0) return [...fallback]
  return ALL_CUSTOMER_GROUP_AREAS.filter((area) => seen.has(area))
}

function intOr(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 999 ? n : fallback
}

export function normaliseSwiftPosMapping(input: CustomerGroupInput): SwiftPosMemberMapping {
  return {
    typeActive: intOr(input.swiftPosTypeActive, DEFAULT_SWIFTPOS_MEMBER_MAPPING.typeActive),
    statusActive: intOr(input.swiftPosStatusActive, DEFAULT_SWIFTPOS_MEMBER_MAPPING.statusActive),
    typeRemoved: intOr(input.swiftPosTypeRemoved, DEFAULT_SWIFTPOS_MEMBER_MAPPING.typeRemoved),
    statusRemoved: intOr(input.swiftPosStatusRemoved, DEFAULT_SWIFTPOS_MEMBER_MAPPING.statusRemoved),
    exportEncoding: String(input.exportEncoding ?? DEFAULT_SWIFTPOS_MEMBER_MAPPING.exportEncoding)
      .trim()
      .toUpperCase() === 'UTF8' ? 'UTF8' : 'UTF8_BOM',
  }
}

export function normaliseGroupInput(input: CustomerGroupInput): NormaliseGroupResult {
  const name = String(input.name ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (!name) return { ok: false, error: 'NAME IS REQUIRED' }

  const kind = String(input.kind ?? 'MEMBER_DATABASE').trim().toUpperCase() === 'GIFT_CARD'
    ? 'GIFT_CARD'
    : 'MEMBER_DATABASE'
  const slug = normaliseGroupSlug(String(input.slug ?? name)) || normaliseGroupSlug(name)
  if (!slug) return { ok: false, error: 'SLUG IS REQUIRED' }

  const fallbackAreas = kind === 'GIFT_CARD' ? GIFT_CARD_GROUP_AREAS : DEFAULT_GROUP_AREAS
  const areaSet = new Set(normaliseAreas(input.areas, fallbackAreas))
  if (kind === 'GIFT_CARD') areaSet.add('GIFT_CARDS')
  areaSet.add('CUSTOMERS')
  const parkingTypeId = String(input.parkingTypeId ?? '').trim() || null
  // A linked parking type implies the group is available in the parking area.
  if (parkingTypeId) areaSet.add('PARKING')
  const areas = ALL_CUSTOMER_GROUP_AREAS.filter((area) => areaSet.has(area))

  return {
    ok: true,
    value: {
      name,
      slug,
      kind,
      description: String(input.description ?? '').trim() || null,
      colour: String(input.colour ?? '').trim() || null,
      isActive: input.isActive === undefined ? true : Boolean(input.isActive),
      sortOrder: Number.isFinite(Number(input.sortOrder)) ? Math.trunc(Number(input.sortOrder)) : 0,
      areas,
      parkingTypeId,
      mapping: normaliseSwiftPosMapping(input),
    },
  }
}

export function groupAreaLabels(areas: string[] | undefined | null): string {
  if (!areas || areas.length === 0) return 'NO AREAS'
  return ALL_CUSTOMER_GROUP_AREAS.filter((area) => areas.includes(area)).join(' · ')
}

export function groupKindLabel(kind: string): string {
  return kind === 'GIFT_CARD' ? 'GIFT CARDS' : 'MEMBERS'
}

export function areaAllows(areas: string[] | undefined | null, area: CustomerGroupArea): boolean {
  return Boolean(areas?.includes(area))
}
