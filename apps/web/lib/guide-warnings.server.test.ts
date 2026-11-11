import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, tx } = vi.hoisted(() => {
  const tx = {
    guideAssignment: { upsert: vi.fn() },
    guideRetrainRequest: { create: vi.fn() },
  }
  const prisma = {
    staff: { findFirst: vi.fn() },
    guide: { findMany: vi.fn() },
    guideRetrainRequest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    guideAssignment: { upsert: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  return { prisma, tx }
})

vi.mock('@hospo-ops/db', () => ({ prisma }))

import { createRetrainRequests, resolveRetrainRequest } from '@/lib/guide-warnings.server'

beforeEach(() => {
  vi.clearAllMocks()
  prisma.staff.findFirst.mockResolvedValue({ id: 's1', isActive: true })
  prisma.guide.findMany.mockResolvedValue([
    { id: 'g1', status: 'PUBLISHED', isTracked: true },
  ])
  prisma.guideRetrainRequest.findMany.mockResolvedValue([])
  tx.guideAssignment.upsert.mockResolvedValue({ id: 'a1' })
  tx.guideRetrainRequest.create.mockImplementation(
    async ({ data }: { data: { guideId: string } }) => ({
      id: `r-${data.guideId}`,
      guideId: data.guideId,
    }),
  )
})

describe('createRetrainRequests', () => {
  it('rejects an empty guide list', async () => {
    const result = await createRetrainRequests({ venueId: 'v1', staffId: 's1', guideIds: [] })
    expect(result).toEqual({ ok: false, status: 400, error: 'PICK AT LEAST ONE GUIDE' })
  })

  it('checks staff in the venue and rejects missing / inactive people', async () => {
    prisma.staff.findFirst.mockResolvedValue(null)
    expect(await createRetrainRequests({ venueId: 'v1', staffId: 's1', guideIds: ['g1'] })).toEqual({
      ok: false,
      status: 404,
      error: 'STAFF NOT FOUND',
    })
    expect(prisma.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 's1', venueId: 'v1', deletedAt: null }),
      }),
    )

    prisma.staff.findFirst.mockResolvedValue({ id: 's1', isActive: false })
    expect(await createRetrainRequests({ venueId: 'v1', staffId: 's1', guideIds: ['g1'] })).toEqual({
      ok: false,
      status: 400,
      error: 'STAFF IS INACTIVE',
    })
  })

  it('only creates for PUBLISHED, tracked guides and reports the rest as skipped', async () => {
    prisma.guide.findMany.mockResolvedValue([
      { id: 'g1', status: 'PUBLISHED', isTracked: true },
      { id: 'g2', status: 'DRAFT', isTracked: true },
      { id: 'g3', status: 'PUBLISHED', isTracked: false },
    ])

    const result = await createRetrainRequests({
      venueId: 'v1',
      staffId: 's1',
      guideIds: ['g1', 'g2', 'g3', 'g4', 'g1'],
    })

    expect(result).toMatchObject({
      ok: true,
      result: {
        created: [{ id: 'r-g1', guideId: 'g1' }],
        skipped: [
          { guideId: 'g2', reason: 'GUIDE IS NOT PUBLISHED' },
          { guideId: 'g3', reason: 'GUIDE IS REFERENCE-ONLY' },
          { guideId: 'g4', reason: 'GUIDE NOT FOUND' },
        ],
      },
    })
  })

  it('skips a guide that already has a PENDING request', async () => {
    prisma.guideRetrainRequest.findMany.mockResolvedValue([{ guideId: 'g1' }])

    const result = await createRetrainRequests({
      venueId: 'v1',
      staffId: 's1',
      guideIds: ['g1'],
    })

    expect(result).toEqual({
      ok: true,
      result: { created: [], skipped: [{ guideId: 'g1', reason: 'ALREADY REQUESTED' }] },
    })
    expect(tx.guideRetrainRequest.create).not.toHaveBeenCalled()
  })

  it('creates the request and revives an existing assignment', async () => {
    const result = await createRetrainRequests({
      venueId: 'v1',
      staffId: 's1',
      guideIds: ['g1'],
      reason: '  MENU CHANGED  ',
      requestedById: 'u1',
    })

    expect(result).toEqual({
      ok: true,
      result: { created: [{ id: 'r-g1', guideId: 'g1' }], skipped: [] },
    })
    expect(tx.guideAssignment.upsert).toHaveBeenCalledWith({
      where: { guideId_staffId: { guideId: 'g1', staffId: 's1' } },
      update: { deletedAt: null },
      create: {
        guideId: 'g1',
        staffId: 's1',
        assignedById: 'u1',
        reason: 'RETRAIN REQUEST',
      },
      select: { id: true },
    })
    expect(tx.guideRetrainRequest.create).toHaveBeenCalledWith({
      data: {
        venueId: 'v1',
        staffId: 's1',
        guideId: 'g1',
        reason: 'MENU CHANGED',
        requestedById: 'u1',
      },
      select: { id: true, guideId: true },
    })
  })
})

describe('resolveRetrainRequest', () => {
  beforeEach(() => {
    prisma.guideRetrainRequest.findFirst.mockResolvedValue({
      id: 'r1',
      venueId: 'v1',
      status: 'PENDING',
    })
    prisma.guideRetrainRequest.update.mockImplementation(
      async ({ data }: { data: { status: string } }) => ({ id: 'r1', status: data.status }),
    )
  })

  it('closes a PENDING request as DONE', async () => {
    const result = await resolveRetrainRequest({
      id: 'r1',
      venueId: 'v1',
      status: 'DONE',
      resolvedById: 's1',
      note: '  redone  ',
    })

    expect(result).toEqual({ ok: true, request: { id: 'r1', status: 'DONE' } })
    expect(prisma.guideRetrainRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: {
        status: 'DONE',
        resolvedById: 's1',
        resolvedAt: expect.any(Date),
        note: 'redone',
      },
      select: { id: true, status: true },
    })
  })

  it('closes a PENDING request as DISMISSED', async () => {
    const result = await resolveRetrainRequest({
      id: 'r1',
      venueId: 'v1',
      status: 'DISMISSED',
      resolvedById: 's1',
    })
    expect(result).toEqual({ ok: true, request: { id: 'r1', status: 'DISMISSED' } })
  })

  it('returns 404 for a missing request and 403 for another venue', async () => {
    prisma.guideRetrainRequest.findFirst.mockResolvedValue(null)
    expect(
      await resolveRetrainRequest({ id: 'r1', venueId: 'v1', status: 'DONE', resolvedById: 's1' }),
    ).toEqual({ ok: false, status: 404, error: 'REQUEST NOT FOUND' })

    prisma.guideRetrainRequest.findFirst.mockResolvedValue({
      id: 'r1',
      venueId: 'v2',
      status: 'PENDING',
    })
    expect(
      await resolveRetrainRequest({ id: 'r1', venueId: 'v1', status: 'DONE', resolvedById: 's1' }),
    ).toEqual({ ok: false, status: 403, error: 'FORBIDDEN' })
  })

  it('409s an illegal transition from a closed request', async () => {
    prisma.guideRetrainRequest.findFirst.mockResolvedValue({
      id: 'r1',
      venueId: 'v1',
      status: 'DONE',
    })
    expect(
      await resolveRetrainRequest({ id: 'r1', venueId: 'v1', status: 'DONE', resolvedById: 's1' }),
    ).toEqual({ ok: false, status: 409, error: 'REQUEST ALREADY CLOSED' })
    expect(prisma.guideRetrainRequest.update).not.toHaveBeenCalled()
  })
})
