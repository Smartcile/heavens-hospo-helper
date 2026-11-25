import { prisma } from '@hospo-ops/db'

// The customer database is the source of truth for a linked parking type. The
// kiosk keeps reading the existing Member table, so this sync copies the group's
// memberships into it (and preserves plates/claims already attached).
export interface ParkingSyncResult {
  linked: boolean
  parkingTypeId: string | null
  synced: number
  deactivated: number
  skipped: number
}

export async function syncCustomerGroupToParking(
  venueId: string,
  groupId: string,
): Promise<ParkingSyncResult> {
  const group = await prisma.customerGroup.findFirst({
    where: { id: groupId, venueId, deletedAt: null },
    select: { id: true, parkingTypeId: true },
  })
  if (!group) {
    return { linked: false, parkingTypeId: null, synced: 0, deactivated: 0, skipped: 0 }
  }

  // Unlinked: retire the parking members that this group previously fed.
  if (!group.parkingTypeId) {
    const cleared = await prisma.member.updateMany({
      where: { venueId, customerGroupId: group.id },
      data: { isActive: false, customerGroupId: null },
    })
    return {
      linked: false,
      parkingTypeId: null,
      synced: 0,
      deactivated: cleared.count,
      skipped: 0,
    }
  }

  const members = await prisma.customerMembership.findMany({
    where: { venueId, groupId: group.id, deletedAt: null },
    select: {
      membershipNumber: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      isActive: true,
    },
  })

  let synced = 0
  let skipped = 0
  for (const member of members) {
    try {
      await prisma.member.upsert({
        where: {
          venueId_membershipNumber: {
            venueId,
            membershipNumber: member.membershipNumber,
          },
        },
        update: {
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          phone: member.phone,
          parkingTypeId: group.parkingTypeId,
          customerGroupId: group.id,
          isActive: member.isActive,
          isTest: false,
          // savePlates is deliberately not synced: a member's own plate-saving
          // preference must survive a customer-group sync.
          deletedAt: null,
        },
        create: {
          venueId,
          membershipNumber: member.membershipNumber,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          phone: member.phone,
          parkingTypeId: group.parkingTypeId,
          customerGroupId: group.id,
          isActive: member.isActive,
          isTest: false,
        },
      })
      synced += 1
    } catch {
      skipped += 1
    }
  }

  // Anyone previously synced from this group who is no longer in it is retired,
  // not deleted, so plates and claims stay attached.
  const numbers = members.map((member) => member.membershipNumber)
  const deactivated = await prisma.member.updateMany({
    where: {
      venueId,
      customerGroupId: group.id,
      ...(numbers.length > 0 ? { membershipNumber: { notIn: numbers } } : {}),
    },
    data: { isActive: false },
  })

  return {
    linked: true,
    parkingTypeId: group.parkingTypeId,
    synced,
    deactivated: deactivated.count,
    skipped,
  }
}

export async function syncCustomerGroupsForMembershipIds(
  venueId: string,
  ids: string[],
): Promise<ParkingSyncResult[]> {
  if (ids.length === 0) return []
  const groups = await prisma.customerMembership.findMany({
    where: { id: { in: ids }, venueId },
    select: { groupId: true },
    distinct: ['groupId'],
  })
  const results: ParkingSyncResult[] = []
  for (const group of groups) {
    results.push(await syncCustomerGroupToParking(venueId, group.groupId))
  }
  return results
}
