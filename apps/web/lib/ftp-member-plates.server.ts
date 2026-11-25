// Shared plate management for FTP members. Removing a remembered plate and
// changing the default are the same rules for the admin member list and the
// public kiosk, so they live here and both routes call them.
//
// Plates are never hard-deleted: removal soft-deletes and sets RETIRED, and the
// oldest remaining ACTIVE plate is promoted when the default is removed. There
// is no unique index on one default, so the promote happens in a transaction.

import { prisma } from '@hospo-ops/db'

export type MemberPlateAction = 'SET_DEFAULT' | 'REMOVE'

export interface MemberPlateView {
  id: string
  plate: string
  isDefault: boolean
}

export interface RemoveMemberPlateArgs {
  venueId: string
  memberId: string
  plateId: string
}

export interface SetDefaultMemberPlateArgs {
  venueId: string
  memberId: string
  plateId: string
}

export type MemberPlateResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }

const ACTIVE = { status: 'ACTIVE', deletedAt: null } as const

export async function listActiveMemberPlates(
  venueId: string,
  memberId: string,
): Promise<MemberPlateView[]> {
  const rows = await prisma.memberPlate.findMany({
    where: { venueId, memberId, ...ACTIVE },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, plate: true, isDefault: true },
  })
  return rows
}

/**
 * Remove one plate and, when it was the default, promote the oldest remaining
 * active plate. The removed row is retired with `isDefault: false` so a stale
 * default can never dangle on a deleted plate.
 */
export async function removeMemberPlate(
  args: RemoveMemberPlateArgs,
): Promise<MemberPlateResult> {
  const plate = await prisma.memberPlate.findFirst({
    where: {
      id: args.plateId,
      memberId: args.memberId,
      venueId: args.venueId,
      ...ACTIVE,
    },
    select: { id: true, isDefault: true },
  })
  if (!plate) return { ok: false, reason: 'NOT_FOUND' }

  await prisma.$transaction(async (tx) => {
    await tx.memberPlate.update({
      where: { id: plate.id },
      data: { deletedAt: new Date(), status: 'RETIRED', isDefault: false },
    })
    if (plate.isDefault) {
      const next = await tx.memberPlate.findFirst({
        where: {
          venueId: args.venueId,
          memberId: args.memberId,
          ...ACTIVE,
          NOT: { id: plate.id },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (next) {
        await tx.memberPlate.update({ where: { id: next.id }, data: { isDefault: true } })
      }
    }
  })

  return { ok: true }
}

/** Make one plate the member's default, clearing any other default. */
export async function setDefaultMemberPlate(
  args: SetDefaultMemberPlateArgs,
): Promise<MemberPlateResult> {
  const plate = await prisma.memberPlate.findFirst({
    where: {
      id: args.plateId,
      memberId: args.memberId,
      venueId: args.venueId,
      ...ACTIVE,
    },
    select: { id: true },
  })
  if (!plate) return { ok: false, reason: 'NOT_FOUND' }

  await prisma.$transaction(async (tx) => {
    await tx.memberPlate.updateMany({
      where: {
        venueId: args.venueId,
        memberId: args.memberId,
        ...ACTIVE,
        isDefault: true,
        NOT: { id: plate.id },
      },
      data: { isDefault: false },
    })
    await tx.memberPlate.update({ where: { id: plate.id }, data: { isDefault: true } })
  })

  return { ok: true }
}

/**
 * Apply a kiosk/admin plate action and return the refreshed active plate list.
 * A wrong/missing plate is a 404; the caller decides the HTTP status.
 */
export async function applyMemberPlateAction(args: {
  venueId: string
  memberId: string
  plateId: string
  action: MemberPlateAction
}): Promise<MemberPlateResult & { plates: MemberPlateView[] }> {
  const result =
    args.action === 'REMOVE'
      ? await removeMemberPlate(args)
      : await setDefaultMemberPlate(args)
  const plates = await listActiveMemberPlates(args.venueId, args.memberId)
  return { ...result, plates }
}
