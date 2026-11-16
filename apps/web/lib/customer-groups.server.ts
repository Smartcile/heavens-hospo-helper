import { prisma, type Prisma } from '@hospo-ops/db'
import {
  GIFT_CARD_GROUP_AREAS,
  GIFT_CARD_GROUP_NAME,
  GIFT_CARD_GROUP_SLUG,
  DEFAULT_SWIFTPOS_MEMBER_MAPPING,
} from './customer-groups'

export const customerGroupInclude = {
  areas: true,
  parkingType: { select: { id: true, name: true } },
  _count: { select: { memberships: true } },
} satisfies Prisma.CustomerGroupInclude

export type CustomerGroupWithAreas = Prisma.CustomerGroupGetPayload<{
  include: typeof customerGroupInclude
}>

export function customerGroupView(group: CustomerGroupWithAreas) {
  return {
    id: group.id,
    venueId: group.venueId,
    name: group.name,
    slug: group.slug,
    kind: group.kind,
    description: group.description,
    colour: group.colour,
    isActive: group.isActive,
    sortOrder: group.sortOrder,
    areas: group.areas.map((a) => a.area),
    parkingTypeId: group.parkingTypeId,
    parkingTypeName: group.parkingType?.name ?? null,
    mapping: {
      typeActive: group.swiftPosTypeActive,
      statusActive: group.swiftPosStatusActive,
      typeRemoved: group.swiftPosTypeRemoved,
      statusRemoved: group.swiftPosStatusRemoved,
      exportEncoding: group.exportEncoding,
    },
    memberCount: group._count.memberships,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  }
}

export async function getCustomerGroupForVenue(venueId: string, groupId: string) {
  return prisma.customerGroup.findFirst({
    where: { id: groupId, venueId, deletedAt: null },
    include: { areas: true },
  })
}

export type ParkingLinkValidation =
  | { ok: true }
  | { ok: false; status: number; error: string }

/** One parking type can feed exactly one customer database. */
export async function validateParkingTypeLink(
  venueId: string,
  parkingTypeId: string | null,
  groupId?: string,
): Promise<ParkingLinkValidation> {
  if (!parkingTypeId) return { ok: true }

  const type = await prisma.ftpParkingType.findFirst({
    where: { id: parkingTypeId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!type) return { ok: false, status: 422, error: 'CHOOSE A VALID PARKING TYPE' }

  const linked = await prisma.customerGroup.findFirst({
    where: {
      venueId,
      parkingTypeId,
      deletedAt: null,
      ...(groupId ? { id: { not: groupId } } : {}),
    },
    select: { name: true },
  })
  if (linked) {
    return {
      ok: false,
      status: 409,
      error: `THAT PARKING TYPE IS ALREADY LINKED TO ${linked.name}`,
    }
  }
  return { ok: true }
}

/**
 * The GIFT CARDS group is created on demand. It shares the venue's membership
 * number space, so the card number is the membership number.
 */
export async function ensureGiftCardGroup(venueId: string): Promise<string> {
  const existing = await prisma.customerGroup.findFirst({
    where: { venueId, slug: GIFT_CARD_GROUP_SLUG },
    include: { areas: true },
  })

  if (existing) {
    if (existing.deletedAt) {
      await prisma.customerGroup.update({
        where: { id: existing.id },
        data: { deletedAt: null, isActive: true },
      })
    }
    const have = new Set(existing.areas.map((a) => a.area))
    const missing = GIFT_CARD_GROUP_AREAS.filter((area) => !have.has(area))
    if (missing.length > 0) {
      await prisma.customerGroupArea.createMany({
        data: missing.map((area) => ({ groupId: existing.id, area })),
        skipDuplicates: true,
      })
    }
    return existing.id
  }

  const created = await prisma.customerGroup.create({
    data: {
      venueId,
      name: GIFT_CARD_GROUP_NAME,
      slug: GIFT_CARD_GROUP_SLUG,
      kind: 'GIFT_CARD',
      description: 'Gift cards issued as SwiftPOS members. The card number is the membership number.',
      sortOrder: 999,
      swiftPosTypeActive: DEFAULT_SWIFTPOS_MEMBER_MAPPING.typeActive,
      swiftPosStatusActive: DEFAULT_SWIFTPOS_MEMBER_MAPPING.statusActive,
      swiftPosTypeRemoved: DEFAULT_SWIFTPOS_MEMBER_MAPPING.typeRemoved,
      swiftPosStatusRemoved: DEFAULT_SWIFTPOS_MEMBER_MAPPING.statusRemoved,
      exportEncoding: DEFAULT_SWIFTPOS_MEMBER_MAPPING.exportEncoding,
      areas: { create: GIFT_CARD_GROUP_AREAS.map((area) => ({ area })) },
    },
  })
  return created.id
}
