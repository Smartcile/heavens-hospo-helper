import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  plateFindFirst,
  plateFindMany,
  plateUpdate,
  plateUpdateMany,
  transaction,
} = vi.hoisted(() => ({
  plateFindFirst: vi.fn(),
  plateFindMany: vi.fn(),
  plateUpdate: vi.fn(),
  plateUpdateMany: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    memberPlate: {
      findFirst: plateFindFirst,
      findMany: plateFindMany,
      update: plateUpdate,
      updateMany: plateUpdateMany,
    },
    $transaction: transaction,
  },
}))

import {
  applyMemberPlateAction,
  listActiveMemberPlates,
  removeMemberPlate,
  setDefaultMemberPlate,
} from './ftp-member-plates.server'

const ARGS = { venueId: 'v1', memberId: 'm1', plateId: 'p1' }

beforeEach(() => {
  vi.clearAllMocks()
  plateFindMany.mockResolvedValue([])
  transaction.mockImplementation(async (run: (tx: unknown) => unknown) =>
    run({
      memberPlate: {
        findFirst: plateFindFirst,
        findMany: plateFindMany,
        update: plateUpdate,
        updateMany: plateUpdateMany,
      },
    }),
  )
})

describe('removeMemberPlate', () => {
  it('retires the plate and promotes the oldest remaining active plate', async () => {
    plateFindFirst
      .mockResolvedValueOnce({ id: 'p1', isDefault: true })
      .mockResolvedValueOnce({ id: 'p2' })

    const result = await removeMemberPlate(ARGS)

    expect(result).toEqual({ ok: true })
    expect(plateUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { deletedAt: expect.any(Date), status: 'RETIRED', isDefault: false },
    })
    expect(plateUpdate).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { isDefault: true },
    })
    const promote = plateFindFirst.mock.calls[1][0]
    expect(promote.where).toMatchObject({
      venueId: 'v1',
      memberId: 'm1',
      status: 'ACTIVE',
      deletedAt: null,
      NOT: { id: 'p1' },
    })
    expect(promote.orderBy).toEqual({ createdAt: 'asc' })
  })

  it('leaves the default alone when a non-default plate is removed', async () => {
    plateFindFirst.mockResolvedValueOnce({ id: 'p2', isDefault: false })

    const result = await removeMemberPlate(ARGS)

    expect(result).toEqual({ ok: true })
    expect(plateFindFirst).toHaveBeenCalledTimes(1)
    expect(plateUpdate).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { deletedAt: expect.any(Date), status: 'RETIRED', isDefault: false },
    })
    const setDefault = plateUpdate.mock.calls.find(
      (call) => call[0].data?.isDefault === true,
    )
    expect(setDefault).toBeUndefined()
  })

  it('rejects a plate that does not belong to the member, venue or an active row', async () => {
    plateFindFirst.mockResolvedValue(null)

    const result = await removeMemberPlate(ARGS)

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(transaction).not.toHaveBeenCalled()
    expect(plateUpdate).not.toHaveBeenCalled()
  })
})

describe('setDefaultMemberPlate', () => {
  it('clears the other defaults and sets the chosen plate', async () => {
    plateFindFirst.mockResolvedValue({ id: 'p2' })

    const result = await setDefaultMemberPlate(ARGS)

    expect(result).toEqual({ ok: true })
    expect(plateUpdateMany).toHaveBeenCalledWith({
      where: {
        venueId: 'v1',
        memberId: 'm1',
        status: 'ACTIVE',
        deletedAt: null,
        isDefault: true,
        NOT: { id: 'p2' },
      },
      data: { isDefault: false },
    })
    expect(plateUpdate).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { isDefault: true },
    })
  })

  it('rejects an unknown plate', async () => {
    plateFindFirst.mockResolvedValue(null)
    const result = await setDefaultMemberPlate(ARGS)
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(transaction).not.toHaveBeenCalled()
  })
})

describe('applyMemberPlateAction', () => {
  it('returns the refreshed active plate list after REMOVE', async () => {
    plateFindFirst.mockResolvedValueOnce({ id: 'p1', isDefault: false })
    plateFindMany.mockResolvedValue([
      { id: 'p2', plate: 'XYZ789', isDefault: true },
    ])

    const result = await applyMemberPlateAction({ ...ARGS, action: 'REMOVE' })

    expect(result).toEqual({
      ok: true,
      plates: [{ id: 'p2', plate: 'XYZ789', isDefault: true }],
    })
    expect(plateFindMany).toHaveBeenCalledWith({
      where: { venueId: 'v1', memberId: 'm1', status: 'ACTIVE', deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, plate: true, isDefault: true },
    })
  })

  it('returns the refreshed list after SET_DEFAULT', async () => {
    plateFindFirst.mockResolvedValue({ id: 'p2' })
    plateFindMany.mockResolvedValue([{ id: 'p2', plate: 'XYZ789', isDefault: true }])

    const result = await applyMemberPlateAction({ ...ARGS, action: 'SET_DEFAULT' })

    expect(result.ok).toBe(true)
    expect(result.plates).toEqual([{ id: 'p2', plate: 'XYZ789', isDefault: true }])
  })

  it('lists the refreshed plates even when the action is rejected', async () => {
    plateFindFirst.mockResolvedValue(null)
    plateFindMany.mockResolvedValue([{ id: 'p3', plate: 'KEEP', isDefault: true }])

    const result = await applyMemberPlateAction({ ...ARGS, action: 'REMOVE' })

    expect(result).toMatchObject({ ok: false, reason: 'NOT_FOUND' })
    expect(result.plates).toEqual([{ id: 'p3', plate: 'KEEP', isDefault: true }])
  })
})

describe('listActiveMemberPlates', () => {
  it('only returns active, non-deleted plates', async () => {
    plateFindMany.mockResolvedValue([])
    await listActiveMemberPlates('v1', 'm1')
    expect(plateFindMany).toHaveBeenCalledWith({
      where: { venueId: 'v1', memberId: 'm1', status: 'ACTIVE', deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, plate: true, isDefault: true },
    })
  })
})
