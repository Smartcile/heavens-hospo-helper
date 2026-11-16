import { prisma, type Prisma } from '@hospo-ops/db'
import { resolveCustomer } from './customer-match'
import {
  effectiveMemberRows,
  memberCustomerName,
  prepareCommitRows,
  toSwiftPosCsv,
  type ExistingMember,
  type MemberImportRow,
} from './member-import'
import {
  normaliseMembershipNumber,
  normaliseSpaces,
  titleCaseName,
} from './member-name'
import { giftCardMemberIdentity, giftCardMemberIsActiveForCard } from './gift-card-members'
import { ensureGiftCardGroup, getCustomerGroupForVenue } from './customer-groups.server'
import {
  syncCustomerGroupToParking,
  syncCustomerGroupsForMembershipIds,
  type ParkingSyncResult,
} from './customer-group-parking.server'
import type { SwiftPosMemberMappingValues } from './member-import'

export const membershipInclude = {
  group: { select: { id: true, name: true, slug: true, kind: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
} satisfies Prisma.CustomerMembershipInclude

export type MembershipWithRelations = Prisma.CustomerMembershipGetPayload<{
  include: typeof membershipInclude
}>

export function membershipView(row: MembershipWithRelations) {
  return {
    id: row.id,
    venueId: row.venueId,
    groupId: row.groupId,
    groupName: row.group.name,
    groupKind: row.group.kind,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    membershipNumber: row.membershipNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: `${row.firstName} ${row.lastName}`.trim(),
    memberType: row.memberType,
    isActive: row.isActive,
    isFamily: row.isFamily,
    isPrimary: row.isPrimary,
    familySurnames: row.familySurnames,
    email: row.email ?? row.customer?.email ?? null,
    phone: row.phone ?? row.customer?.phone ?? null,
    memberInterests: row.memberInterests,
    company: row.company,
    externalId: row.externalId,
    source: row.source,
    giftCardId: row.giftCardId,
    lastImportedAt: row.lastImportedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function loadExistingForGroup(
  venueId: string,
  groupId: string,
): Promise<{ existing: Record<string, ExistingMember>; previousPrimaryName: Record<string, string> }> {
  const rows = await prisma.customerMembership.findMany({
    where: { venueId, groupId, deletedAt: null },
    select: {
      membershipNumber: true,
      firstName: true,
      lastName: true,
      isActive: true,
      isPrimary: true,
      familySurnames: true,
    },
  })
  const existing: Record<string, ExistingMember> = {}
  const previousPrimaryName: Record<string, string> = {}
  for (const row of rows) {
    existing[row.membershipNumber] = {
      firstName: row.firstName,
      lastName: row.lastName,
      isActive: row.isActive,
      isPrimary: row.isPrimary,
      familySurnames: row.familySurnames,
    }
    if (row.isPrimary) previousPrimaryName[row.membershipNumber] = row.firstName
  }
  return { existing, previousPrimaryName }
}

export interface CommitMemberImportInput {
  venueId: string
  groupId: string
  rows: MemberImportRow[]
}

export interface CommitMemberImportResult {
  created: number
  updated: number
  total: number
  issues: { code: string; severity: string; rowId?: string; message: string }[]
  parkingSync?: ParkingSyncResult | null
}

export async function commitMemberImport(
  input: CommitMemberImportInput,
): Promise<CommitMemberImportResult> {
  const group = await getCustomerGroupForVenue(input.venueId, input.groupId)
  if (!group) throw new Error('CUSTOMER GROUP NOT FOUND')

  const prepared = prepareCommitRows(input.rows)
  if (prepared.rows.length === 0) {
    return { created: 0, updated: 0, total: 0, issues: prepared.issues }
  }

  const now = new Date()
  const result = await prisma.$transaction(
    async (tx) => {
      let created = 0
      let updated = 0
      for (const row of prepared.rows) {
        const customerId = await resolveCustomer(tx, input.venueId, {
          name: memberCustomerName({
            firstName: row.firstName,
            lastName: row.lastName,
            isFamily: row.isFamily,
            familySurnames: row.familySurnames,
          }),
          email: row.email || null,
          phone: row.phone || null,
        })
        const existing = await tx.customerMembership.findFirst({
          where: { venueId: input.venueId, membershipNumber: row.membershipNumber },
          select: { id: true, groupId: true },
        })
        const data = {
          venueId: input.venueId,
          groupId: input.groupId,
          customerId,
          membershipNumber: row.membershipNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          memberType: row.memberType || null,
          isActive: row.isActive,
          isFamily: row.isFamily,
          isPrimary: row.isPrimary,
          familySurnames: row.familySurnames || null,
          email: row.email || null,
          phone: row.phone || null,
          memberInterests: row.memberInterests || null,
          company: row.company || null,
          externalId: row.externalId || null,
          source: 'HUBSPOT' as const,
          lastImportedAt: now,
          deletedAt: null,
        }
        if (existing) {
          await tx.customerMembership.update({ where: { id: existing.id }, data })
          updated += 1
        } else {
          await tx.customerMembership.create({ data })
          created += 1
        }
      }
      return { created, updated }
    },
    { timeout: 300_000 },
  )

  let parkingSync: ParkingSyncResult | null = null
  try {
    parkingSync = await syncCustomerGroupToParking(input.venueId, input.groupId)
  } catch (error) {
    console.error('customer database parking sync failed (non-blocking):', error)
  }

  return {
    ...result,
    total: prepared.rows.length,
    issues: prepared.issues,
    parkingSync,
  }
}

export interface ListMembershipOptions {
  venueId: string
  groupId?: string | null
  search?: string | null
  status?: 'active' | 'inactive' | 'all'
  limit?: number
}

export async function listMemberships(options: ListMembershipOptions): Promise<MembershipWithRelations[]> {
  const where: Prisma.CustomerMembershipWhereInput = {
    venueId: options.venueId,
    deletedAt: null,
  }
  if (options.groupId) where.groupId = options.groupId
  if (options.status === 'active') where.isActive = true
  if (options.status === 'inactive') where.isActive = false
  const search = normaliseSpaces(options.search)
  if (search) {
    where.OR = [
      { membershipNumber: { contains: search } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ]
  }
  return prisma.customerMembership.findMany({
    where,
    include: membershipInclude,
    orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    take: Math.min(Math.max(options.limit ?? 500, 1), 2000),
  })
}

export interface MembershipInput {
  groupId: string
  membershipNumber: string
  firstName?: string
  lastName?: string
  memberType?: string | null
  isActive?: boolean
  isFamily?: boolean
  isPrimary?: boolean
  familySurnames?: string | null
  email?: string | null
  phone?: string | null
  memberInterests?: string | null
  company?: string | null
  externalId?: string | null
}

function cleanOptional(value: unknown): string | null {
  const text = normaliseSpaces(String(value ?? ''))
  return text || null
}

export async function createMembership(
  venueId: string,
  input: MembershipInput,
): Promise<MembershipWithRelations> {
  const group = await getCustomerGroupForVenue(venueId, input.groupId)
  if (!group) throw new Error('CUSTOMER GROUP NOT FOUND')

  const number = normaliseMembershipNumber(input.membershipNumber)
  if (!number) throw new Error('MEMBERSHIP NUMBER MUST BE NUMERIC')

  const firstName = titleCaseName(input.firstName) || 'UNKNOWN'
  const familySurnames = cleanOptional(input.familySurnames)
  const lastName = input.isFamily && familySurnames
    ? familySurnames
    : titleCaseName(input.lastName, { surname: true })
  const email = cleanOptional(input.email)
  const phone = cleanOptional(input.phone)
  const customerId = await resolveCustomer(prisma, venueId, {
    name: memberCustomerName({
      firstName,
      lastName,
      isFamily: input.isFamily,
      familySurnames,
    }),
    email,
    phone,
  })

  const existing = await prisma.customerMembership.findFirst({
    where: { venueId, membershipNumber: number.base },
    select: { id: true },
  })
  const data = {
    venueId,
    groupId: input.groupId,
    customerId,
    membershipNumber: number.base,
    firstName,
    lastName,
    memberType: cleanOptional(input.memberType),
    isActive: input.isActive ?? true,
    isFamily: input.isFamily ?? false,
    isPrimary: input.isPrimary ?? true,
    familySurnames,
    email,
    phone,
    memberInterests: cleanOptional(input.memberInterests),
    company: cleanOptional(input.company),
    externalId: cleanOptional(input.externalId),
    source: 'MANUAL' as const,
    deletedAt: null,
  }

  const id = existing
    ? (await prisma.customerMembership.update({ where: { id: existing.id }, data })).id
    : (await prisma.customerMembership.create({ data })).id

  try {
    await syncCustomerGroupToParking(venueId, input.groupId)
  } catch (error) {
    console.error('customer database parking sync failed (non-blocking):', error)
  }

  return prisma.customerMembership.findUniqueOrThrow({ where: { id }, include: membershipInclude })
}

export interface MembershipPatch {
  firstName?: unknown
  lastName?: unknown
  memberType?: unknown
  isActive?: unknown
  isFamily?: unknown
  isPrimary?: unknown
  familySurnames?: unknown
  email?: unknown
  phone?: unknown
  memberInterests?: unknown
  company?: unknown
  externalId?: unknown
}

export async function updateMembership(
  venueId: string,
  id: string,
  patch: MembershipPatch,
): Promise<MembershipWithRelations | null> {
  const existing = await prisma.customerMembership.findFirst({
    where: { id, venueId, deletedAt: null },
  })
  if (!existing) return null

  const data: Prisma.CustomerMembershipUpdateInput = {}
  if (patch.firstName !== undefined) data.firstName = titleCaseName(String(patch.firstName)) || 'UNKNOWN'
  if (patch.lastName !== undefined) data.lastName = titleCaseName(String(patch.lastName), { surname: true })
  if (patch.memberType !== undefined) data.memberType = cleanOptional(patch.memberType)
  if (patch.isActive !== undefined) data.isActive = Boolean(patch.isActive)
  if (patch.isFamily !== undefined) data.isFamily = Boolean(patch.isFamily)
  if (patch.isPrimary !== undefined) data.isPrimary = Boolean(patch.isPrimary)
  if (patch.familySurnames !== undefined) data.familySurnames = cleanOptional(patch.familySurnames)
  if (patch.email !== undefined) data.email = cleanOptional(patch.email)
  if (patch.phone !== undefined) data.phone = cleanOptional(patch.phone)
  if (patch.memberInterests !== undefined) data.memberInterests = cleanOptional(patch.memberInterests)
  if (patch.company !== undefined) data.company = cleanOptional(patch.company)
  if (patch.externalId !== undefined) data.externalId = cleanOptional(patch.externalId)

  const updated = await prisma.customerMembership.update({ where: { id }, data })
  try {
    await syncCustomerGroupToParking(venueId, existing.groupId)
  } catch (error) {
    console.error('customer database parking sync failed (non-blocking):', error)
  }
  return prisma.customerMembership.findUniqueOrThrow({
    where: { id: updated.id },
    include: membershipInclude,
  })
}

export async function archiveMembership(venueId: string, id: string): Promise<number> {
  const row = await prisma.customerMembership.findFirst({
    where: { id, venueId, deletedAt: null },
    select: { groupId: true },
  })
  const result = await prisma.customerMembership.updateMany({
    where: { id, venueId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  if (row && result.count === 1) {
    try {
      await syncCustomerGroupToParking(venueId, row.groupId)
    } catch (error) {
      console.error('customer database parking sync failed (non-blocking):', error)
    }
  }
  return result.count
}

export type MembershipBulkAction = 'ACTIVATE' | 'DEACTIVATE' | 'ARCHIVE'

export async function bulkMemberships(
  venueId: string,
  ids: string[],
  action: MembershipBulkAction,
): Promise<number> {
  const cleanIds = ids.filter((id) => typeof id === 'string' && id.trim())
  if (cleanIds.length === 0) return 0
  const count =
    action === 'ARCHIVE'
      ? await archiveMany(venueId, cleanIds)
      : (
          await prisma.customerMembership.updateMany({
            where: { id: { in: cleanIds }, venueId, deletedAt: null },
            data: { isActive: action === 'ACTIVATE' },
          })
        ).count
  try {
    await syncCustomerGroupsForMembershipIds(venueId, cleanIds)
  } catch (error) {
    console.error('customer database parking sync failed (non-blocking):', error)
  }
  return count
}

async function archiveMany(venueId: string, ids: string[]): Promise<number> {
  const result = await prisma.customerMembership.updateMany({
    where: { id: { in: ids }, venueId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  return result.count
}

function membershipToImportRow(row: MembershipWithRelations): MemberImportRow {
  const displayName = `${row.firstName} ${row.lastName}`.trim()
  return {
    id: row.id,
    sourceRow: 0,
    membershipNumber: row.membershipNumber,
    baseNumber: row.membershipNumber,
    suffix: '',
    firstName: row.firstName,
    lastName: row.lastName,
    displayName,
    memberType: row.memberType ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    memberInterests: row.memberInterests ?? '',
    company: row.company ?? '',
    externalId: row.externalId ?? '',
    isFamily: row.isFamily,
    isPrimary: row.isPrimary,
    familySurnames: row.familySurnames ?? '',
    isActive: row.isActive,
    activeSource: 'DEFAULT',
    include: true,
    needsAi: false,
    action: 'UNCHANGED',
    issues: [],
    rawSurnames: [],
  }
}

export async function exportMembershipsCsv(
  venueId: string,
  groupId: string,
  status: 'active' | 'inactive' | 'all',
): Promise<{ csv: string; filename: string; encoding: string; groupName: string }> {
  const group = await getCustomerGroupForVenue(venueId, groupId)
  if (!group) throw new Error('CUSTOMER GROUP NOT FOUND')

  const memberships = await listMemberships({ venueId, groupId, status, limit: 2000 })
  const rows = effectiveMemberRows(memberships.map(membershipToImportRow))
  const mapping: SwiftPosMemberMappingValues = {
    typeActive: group.swiftPosTypeActive,
    statusActive: group.swiftPosStatusActive,
    typeRemoved: group.swiftPosTypeRemoved,
    statusRemoved: group.swiftPosStatusRemoved,
  }
  const csv = toSwiftPosCsv(rows, mapping)
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `${group.slug}-members-${stamp}.csv`
  return { csv, filename, encoding: group.exportEncoding, groupName: group.name }
}

async function syncGiftCardMembershipInner(cardId: string): Promise<{
  ok: boolean
  membershipId?: string
  groupId?: string
  skipped?: boolean
}> {
  const card = await prisma.giftCard.findFirst({
    where: { id: cardId, deletedAt: null },
    select: {
      id: true,
      venueId: true,
      number: true,
      status: true,
      customerName: true,
      customerEmail: true,
      expiresAt: true,
    },
  })
  if (!card) return { ok: false }

  const groupId = await ensureGiftCardGroup(card.venueId)

  // Premade DRAFT cards are not members yet. If this card previously had a
  // membership (reset to draft), mark it inactive rather than leaving it live.
  if (card.status === 'DRAFT') {
    await prisma.customerMembership.updateMany({
      where: { venueId: card.venueId, giftCardId: card.id },
      data: { isActive: false },
    })
    return { ok: true, groupId, skipped: true }
  }

  const identity = giftCardMemberIdentity(card)
  const customerId =
    card.customerName || card.customerEmail
      ? await resolveCustomer(prisma, card.venueId, {
          name: card.customerName,
          email: card.customerEmail,
        })
      : null
  const isActive = giftCardMemberIsActiveForCard(card)
  const shared = {
    groupId,
    customerId,
    firstName: identity.firstName,
    lastName: identity.lastName,
    memberType: 'GIFT CARD',
    isActive,
    isFamily: false,
    isPrimary: true,
    familySurnames: null,
    email: card.customerEmail,
    phone: null,
    memberInterests: null,
    company: null,
    externalId: null,
    source: 'GIFT_CARD' as const,
    giftCardId: card.id,
    deletedAt: null,
  }
  const membership = await prisma.customerMembership.upsert({
    where: { venueId_membershipNumber: { venueId: card.venueId, membershipNumber: card.number } },
    update: shared,
    create: {
      ...shared,
      venueId: card.venueId,
      membershipNumber: card.number,
    },
  })
  return { ok: true, membershipId: membership.id, groupId }
}

/**
 * Best-effort. Never throw into a gift-card issue/redeem/reset path. Test
 * doubles for the gift-card library do not model the membership tables, so the
 * failure is silent there and logged in a real deployment.
 */
export async function syncGiftCardMembership(cardId: string): Promise<{
  ok: boolean
  membershipId?: string
  groupId?: string
  skipped?: boolean
}> {
  try {
    return await syncGiftCardMembershipInner(cardId)
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('gift card membership sync failed (non-blocking):', error)
    }
    return { ok: false }
  }
}

/** Backfill issued cards into the GIFT CARDS group. DRAFT cards are skipped. */
export async function syncGiftCardMembershipsForVenue(
  venueId: string,
): Promise<{ synced: number; failed: number }> {
  const cards = await prisma.giftCard.findMany({
    where: { venueId, deletedAt: null, status: { not: 'DRAFT' } },
    select: { id: true },
  })
  let synced = 0
  let failed = 0
  for (const card of cards) {
    try {
      const result = await syncGiftCardMembership(card.id)
      if (result.ok) synced += 1
      else failed += 1
    } catch {
      failed += 1
    }
  }
  return { synced, failed }
}
