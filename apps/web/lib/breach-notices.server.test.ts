import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    staff: { findFirst: vi.fn(), findUnique: vi.fn() },
    breachNotice: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    staffParkingPlate: { findMany: vi.fn(), findFirst: vi.fn() },
    staffParkingPlateRequest: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))

import {
  autoFileBreachPlateRequest,
  createBreachNotice,
  reviewBreachNotice,
  withdrawBreachNotice,
} from './breach-notices.server'

const input = {
  subjectType: 'STAFF',
  kind: 'PARKING',
  numberplate: 'ab 123',
  noticeDetails: 'Infringement 998877',
  breachDate: '2026-11-01',
  attachmentUrls: ['/api/upload/photo.jpg'],
}

function notice(overrides: Record<string, unknown> = {}) {
  return { id: 'n1', status: 'SUBMITTED', ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.staff.findFirst.mockResolvedValue({ id: 's1' })
  prisma.breachNotice.findFirst.mockResolvedValue(null)
  prisma.breachNotice.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    notice({ ...data }),
  )
  prisma.breachNotice.updateMany.mockResolvedValue({ count: 1 })
  prisma.breachNotice.findUnique.mockResolvedValue(notice({ status: 'WAIVED' }))
  prisma.staffParkingPlate.findMany.mockResolvedValue([])
  prisma.staffParkingPlate.findFirst.mockResolvedValue(null)
  prisma.staffParkingPlateRequest.findFirst.mockResolvedValue(null)
  prisma.staffParkingPlateRequest.create.mockResolvedValue({ id: 'r1' })
})

describe('createBreachNotice', () => {
  it('stamps the venue and submitter and files a plate request', async () => {
    const result = await createBreachNotice({
      venueId: 'v1',
      submittedById: 's1',
      input,
      today: '2026-11-26',
      allowClient: false,
    })
    expect(result.ok).toBe(true)
    expect(prisma.breachNotice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        venueId: 'v1',
        submittedById: 's1',
        subjectStaffId: 's1',
        subjectType: 'STAFF',
        numberplate: 'AB123',
        status: 'SUBMITTED',
      }),
    })
    expect(prisma.staffParkingPlateRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ venueId: 'v1', staffId: 's1', plate: 'AB123', status: 'PENDING' }),
    })
  })

  it('rejects a subject that is not the submitter', async () => {
    const result = await createBreachNotice({
      venueId: 'v1',
      submittedById: 's1',
      input: { ...input, subjectStaffId: 's2' },
      today: '2026-11-26',
      allowClient: false,
    })
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(prisma.breachNotice.create).not.toHaveBeenCalled()
  })

  it('requires review permission for a CLIENT notice and keeps no staff subject', async () => {
    const denied = await createBreachNotice({
      venueId: 'v1',
      submittedById: 's1',
      input: { ...input, subjectType: 'CLIENT' },
      today: '2026-11-26',
      allowClient: false,
    })
    expect(denied).toMatchObject({ ok: false, status: 403 })

    const created = await createBreachNotice({
      venueId: 'v1',
      submittedById: 's1',
      input: { ...input, subjectType: 'CLIENT', clientName: 'Pat' },
      today: '2026-11-26',
      allowClient: true,
    })
    expect(created.ok).toBe(true)
    expect(prisma.breachNotice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ subjectType: 'CLIENT', subjectStaffId: null, clientName: 'Pat' }),
    })
  })

  it('rejects a CLIENT notice that names a staff subject', async () => {
    const result = await createBreachNotice({
      venueId: 'v1',
      submittedById: 's1',
      input: { ...input, subjectType: 'CLIENT', subjectStaffId: 's1' },
      today: '2026-11-26',
      allowClient: true,
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('409s a duplicate reference', async () => {
    prisma.breachNotice.findFirst.mockResolvedValue({ id: 'existing' })
    const result = await createBreachNotice({
      venueId: 'v1',
      submittedById: 's1',
      input: { ...input, subjectType: 'CLIENT', clientReference: 'X1' },
      today: '2026-11-26',
      allowClient: true,
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(prisma.breachNotice.create).not.toHaveBeenCalled()
  })

  it('still saves the notice when the plate request fails', async () => {
    prisma.staffParkingPlateRequest.create.mockRejectedValue(new Error('db down'))
    prisma.breachNotice.findUnique.mockResolvedValue(notice())
    const result = await createBreachNotice({
      venueId: 'v1',
      submittedById: 's1',
      input,
      today: '2026-11-26',
      allowClient: false,
    })
    expect(result.ok).toBe(true)
  })
})

describe('autoFileBreachPlateRequest', () => {
  it('does not duplicate an already-approved plate', async () => {
    prisma.staffParkingPlate.findMany.mockResolvedValue([{ plate: 'AB123' }])
    expect(await autoFileBreachPlateRequest({ venueId: 'v1', staffId: 's1', plate: 'ab123' })).toBe(false)
    expect(prisma.staffParkingPlateRequest.create).not.toHaveBeenCalled()
  })

  it('does not duplicate a pending request', async () => {
    prisma.staffParkingPlateRequest.findFirst.mockResolvedValue({ id: 'r1' })
    expect(await autoFileBreachPlateRequest({ venueId: 'v1', staffId: 's1', plate: 'AB123' })).toBe(false)
    expect(prisma.staffParkingPlateRequest.create).not.toHaveBeenCalled()
  })

  it('does not claim a plate already active for someone else', async () => {
    prisma.staffParkingPlate.findFirst.mockResolvedValue({ id: 'p2' })
    expect(await autoFileBreachPlateRequest({ venueId: 'v1', staffId: 's1', plate: 'AB123' })).toBe(false)
    expect(prisma.staffParkingPlateRequest.create).not.toHaveBeenCalled()
  })
})

describe('reviewBreachNotice', () => {
  it('409s when the row is already closed', async () => {
    prisma.breachNotice.findFirst.mockResolvedValue({ id: 'n1', status: 'WAIVED' })
    const result = await reviewBreachNotice({
      id: 'n1',
      venueId: 'v1',
      reviewedById: 'm1',
      action: 'WAIVE',
      note: 'goodwill',
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(prisma.breachNotice.updateMany).not.toHaveBeenCalled()
  })

  it('requires a reason', async () => {
    const result = await reviewBreachNotice({
      id: 'n1',
      venueId: 'v1',
      reviewedById: 'm1',
      action: 'PAID',
      note: '  ',
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('records the decision with a conditional update', async () => {
    prisma.breachNotice.findFirst.mockResolvedValue({ id: 'n1', status: 'SUBMITTED' })
    const result = await reviewBreachNotice({
      id: 'n1',
      venueId: 'v1',
      reviewedById: 'm1',
      action: 'MARK PAID',
      note: 'Venue paid',
    })
    expect(result.ok).toBe(true)
    expect(prisma.breachNotice.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'n1', venueId: 'v1', status: 'SUBMITTED' }),
      data: expect.objectContaining({ status: 'PAID', reviewedById: 'm1' }),
    })
  })
})

describe('withdrawBreachNotice', () => {
  it("refuses another person's notice", async () => {
    prisma.breachNotice.findFirst.mockResolvedValue({ id: 'n1', status: 'SUBMITTED', submittedById: 's2' })
    const result = await withdrawBreachNotice({ id: 'n1', venueId: 'v1', staffId: 's1', allowAny: false })
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(prisma.breachNotice.updateMany).not.toHaveBeenCalled()
  })

  it('withdraws an own SUBMITTED notice', async () => {
    prisma.breachNotice.findFirst.mockResolvedValue({ id: 'n1', status: 'SUBMITTED', submittedById: 's1' })
    prisma.breachNotice.findUnique.mockResolvedValue(notice({ status: 'WITHDRAWN' }))
    const result = await withdrawBreachNotice({ id: 'n1', venueId: 'v1', staffId: 's1', allowAny: false })
    expect(result.ok).toBe(true)
    expect(prisma.breachNotice.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'n1', status: 'SUBMITTED' }),
      data: expect.objectContaining({ status: 'WITHDRAWN' }),
    })
  })
})
