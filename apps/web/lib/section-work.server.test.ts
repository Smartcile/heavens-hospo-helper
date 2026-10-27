import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db, resolvePathwayForStaff } = vi.hoisted(() => {
  const db = {
    staff: { findFirst: vi.fn() },
    section: { findMany: vi.fn() },
    guideAudience: { findMany: vi.fn() },
    guideCompletion: { findMany: vi.fn() },
    pathway: { findMany: vi.fn() },
    sectionWorkReview: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    staffSection: { upsert: vi.fn() },
    $transaction: vi.fn(),
  }
  db.$transaction.mockImplementation(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg)
    if (typeof arg === 'function') return (arg as (tx: unknown) => Promise<unknown>)(db)
    return []
  })
  return { db, resolvePathwayForStaff: vi.fn() }
})

vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/pathway-for-staff', () => ({ resolvePathwayForStaff }))

import {
  listSectionWorkReviews,
  reconcileSectionWork,
  reviewSectionWork,
} from '@/lib/section-work.server'

const audienceRows = [
  { guideId: 'g1', targetId: 'sec1', guide: { status: 'PUBLISHED', isTracked: true } },
  { guideId: 'g2', targetId: 'sec1', guide: { status: 'PUBLISHED', isTracked: true } },
]

beforeEach(() => {
  vi.clearAllMocks()
  db.staff.findFirst.mockResolvedValue({
    id: 's1',
    venueId: 'v1',
    sections: [],
  })
  db.section.findMany.mockResolvedValue([{ id: 'sec1' }])
  db.guideAudience.findMany.mockResolvedValue(audienceRows)
  db.guideCompletion.findMany.mockResolvedValue([{ guideId: 'g1' }, { guideId: 'g2' }])
  db.pathway.findMany.mockResolvedValue([])
  db.sectionWorkReview.findMany.mockResolvedValue([])
  db.sectionWorkReview.create.mockResolvedValue({ id: 'r1' })
  db.sectionWorkReview.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'r1',
    ...data,
  }))
  db.staffSection.upsert.mockResolvedValue({ id: 'ss1' })
  resolvePathwayForStaff.mockResolvedValue(null)
})

describe('reconcileSectionWork', () => {
  it('creates one PENDING review when every section guide is complete', async () => {
    const result = await reconcileSectionWork('s1')
    expect(result).toMatchObject({ created: 1, reopened: 0 })
    expect(db.sectionWorkReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        staffId: 's1',
        sectionId: 'sec1',
        source: 'GUIDES',
        status: 'PENDING',
        evidence: 'GUIDES:g1,g2',
      }),
    })
    // The whole point of the review gate: reconciliation never grants the section.
    expect(db.staffSection.upsert).not.toHaveBeenCalled()
  })

  it('does not create a review for a section with zero guides', async () => {
    db.guideAudience.findMany.mockResolvedValue([])
    const result = await reconcileSectionWork('s1')
    expect(result).toMatchObject({ created: 0 })
    expect(db.sectionWorkReview.create).not.toHaveBeenCalled()
  })

  it('does not create a review while guides are only partially complete', async () => {
    db.guideCompletion.findMany.mockResolvedValue([{ guideId: 'g1' }])
    const result = await reconcileSectionWork('s1')
    expect(result).toMatchObject({ created: 0 })
    expect(db.sectionWorkReview.create).not.toHaveBeenCalled()
  })

  it('skips a section the person already holds', async () => {
    db.staff.findFirst.mockResolvedValue({
      id: 's1',
      venueId: 'v1',
      sections: [{ sectionId: 'sec1' }],
    })
    const result = await reconcileSectionWork('s1')
    expect(result).toMatchObject({ created: 0 })
    expect(db.sectionWorkReview.create).not.toHaveBeenCalled()
  })

  it('is idempotent while a review is pending with the same evidence', async () => {
    db.sectionWorkReview.findMany.mockResolvedValue([
      { id: 'r1', sectionId: 'sec1', status: 'PENDING', evidence: 'GUIDES:g1,g2' },
    ])
    const result = await reconcileSectionWork('s1')
    expect(result).toMatchObject({ created: 0, reopened: 0, updated: 0 })
    expect(db.sectionWorkReview.create).not.toHaveBeenCalled()
    expect(db.sectionWorkReview.update).not.toHaveBeenCalled()
  })

  it('leaves a dismissed review dismissed while the evidence is unchanged', async () => {
    db.sectionWorkReview.findMany.mockResolvedValue([
      { id: 'r1', sectionId: 'sec1', status: 'DISMISSED', evidence: 'GUIDES:g1,g2' },
    ])
    const result = await reconcileSectionWork('s1')
    expect(result).toMatchObject({ created: 0, reopened: 0 })
    expect(db.sectionWorkReview.update).not.toHaveBeenCalled()
  })

  it('reopens a dismissed review when new qualifying evidence appears', async () => {
    db.guideAudience.findMany.mockResolvedValue([
      ...audienceRows,
      { guideId: 'g3', targetId: 'sec1', guide: { status: 'PUBLISHED', isTracked: true } },
    ])
    db.guideCompletion.findMany.mockResolvedValue([
      { guideId: 'g1' },
      { guideId: 'g2' },
      { guideId: 'g3' },
    ])
    db.sectionWorkReview.findMany.mockResolvedValue([
      { id: 'r1', sectionId: 'sec1', status: 'DISMISSED', evidence: 'GUIDES:g1,g2' },
    ])
    const result = await reconcileSectionWork('s1')
    expect(result).toMatchObject({ reopened: 1 })
    expect(db.sectionWorkReview.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({
        status: 'PENDING',
        evidence: 'GUIDES:g1,g2,g3',
      }),
    })
  })

  it('auto-dismisses a pending review whose evidence disappeared', async () => {
    db.guideAudience.findMany.mockResolvedValue([])
    db.sectionWorkReview.findMany.mockResolvedValue([
      { id: 'r1', sectionId: 'sec1', status: 'PENDING', evidence: 'GUIDES:g1,g2' },
    ])
    const result = await reconcileSectionWork('s1')
    expect(result).toMatchObject({ dismissed: 1 })
    expect(db.sectionWorkReview.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({ status: 'DISMISSED', note: 'EVIDENCE REMOVED' }),
    })
  })

  it('raises a PATHWAY review when a section milestone is complete', async () => {
    db.guideAudience.findMany.mockResolvedValue([])
    db.pathway.findMany.mockResolvedValue([{ id: 'p1', sectionId: 'sec1' }])
    resolvePathwayForStaff.mockResolvedValue({
      nodes: [{ kind: 'MILESTONE', status: 'DONE' }],
    })
    const result = await reconcileSectionWork('s1')
    expect(result).toMatchObject({ created: 1 })
    expect(db.sectionWorkReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sectionId: 'sec1',
        source: 'PATHWAY',
        pathwayId: 'p1',
        evidence: 'PATHWAY:p1',
      }),
    })
    expect(db.staffSection.upsert).not.toHaveBeenCalled()
  })
})

describe('reviewSectionWork', () => {
  beforeEach(() => {
    db.sectionWorkReview.findFirst.mockResolvedValue({
      id: 'r1',
      staffId: 's1',
      sectionId: 'sec1',
    })
  })

  it('CONFIRM creates the StaffSection link and stamps the review', async () => {
    const result = await reviewSectionWork({
      reviewId: 'r1',
      action: 'CONFIRM',
      reviewerId: 'm1',
      note: 'seen on the floor',
    })
    expect(result.ok).toBe(true)
    expect(db.staffSection.upsert).toHaveBeenCalledWith({
      where: { staffId_sectionId: { staffId: 's1', sectionId: 'sec1' } },
      create: { staffId: 's1', sectionId: 'sec1' },
      update: {},
    })
    expect(db.sectionWorkReview.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({
        status: 'CONFIRMED',
        reviewedById: 'm1',
        note: 'seen on the floor',
      }),
    })
  })

  it('DISMISS closes the review without granting the section', async () => {
    const result = await reviewSectionWork({ reviewId: 'r1', action: 'DISMISS', reviewerId: 'm1' })
    expect(result.ok).toBe(true)
    expect(db.staffSection.upsert).not.toHaveBeenCalled()
    expect(db.sectionWorkReview.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({ status: 'DISMISSED', reviewedById: 'm1' }),
    })
  })

  it('REOPEN puts a dismissed review back in the queue without granting it', async () => {
    const result = await reviewSectionWork({ reviewId: 'r1', action: 'REOPEN', reviewerId: 'm1' })
    expect(result.ok).toBe(true)
    expect(db.staffSection.upsert).not.toHaveBeenCalled()
    expect(db.sectionWorkReview.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({ status: 'PENDING', reviewedById: null }),
    })
  })

  it('404s for an unknown review', async () => {
    db.sectionWorkReview.findFirst.mockResolvedValue(null)
    const result = await reviewSectionWork({ reviewId: 'nope', action: 'CONFIRM', reviewerId: 'm1' })
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(db.staffSection.upsert).not.toHaveBeenCalled()
  })
})

describe('listSectionWorkReviews', () => {
  it('returns staff/section labels and hides reviews for sections already held', async () => {
    db.sectionWorkReview.findMany.mockResolvedValue([
      {
        id: 'r1',
        staffId: 's1',
        sectionId: 'sec1',
        source: 'GUIDES',
        status: 'PENDING',
        evidence: 'GUIDES:g1,g2',
        requestedAt: new Date('2026-10-01T00:00:00Z'),
        note: null,
        staff: { firstName: 'JANE', lastName: 'SMITH', deletedAt: null, sections: [] },
        section: { name: 'BAR', deletedAt: null },
      },
      {
        id: 'r2',
        staffId: 's2',
        sectionId: 'sec2',
        source: 'PATHWAY',
        status: 'PENDING',
        evidence: 'PATHWAY:p1',
        requestedAt: new Date('2026-10-02T00:00:00Z'),
        note: null,
        staff: { firstName: 'JOHN', lastName: 'DOE', deletedAt: null, sections: [{ sectionId: 'sec2' }] },
        section: { name: 'KITCHEN', deletedAt: null },
      },
    ])
    const reviews = await listSectionWorkReviews('v1', 'PENDING')
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      staffName: 'SMITH, JANE',
      sectionName: 'BAR',
      evidenceLabel: '2 GUIDES COMPLETE',
    })
  })
})
