import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db } = vi.hoisted(() => ({
  db: {
    department: { count: vi.fn() },
    section: { count: vi.fn() },
    guide: { count: vi.fn() },
  },
}))

vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { validateWorkerTaskRefs } from '@/lib/worker-task-refs.server'

beforeEach(() => {
  vi.clearAllMocks()
  db.department.count.mockResolvedValue(1)
  db.section.count.mockResolvedValue(1)
  db.guide.count.mockResolvedValue(0)
})

describe('validateWorkerTaskRefs', () => {
  it('accepts refs that belong to the venue', async () => {
    db.guide.count.mockResolvedValue(1)
    await expect(
      validateWorkerTaskRefs({
        venueId: 'v1',
        departmentId: 'd1',
        sectionId: 's1',
        guideIds: ['g1'],
      }),
    ).resolves.toBeNull()

    expect(db.department.count).toHaveBeenCalledWith({
      where: { id: 'd1', venueId: 'v1', deletedAt: null },
    })
    expect(db.section.count).toHaveBeenCalledWith({
      where: { id: 's1', venueId: 'v1', deletedAt: null },
    })
    expect(db.guide.count).toHaveBeenCalledWith({
      where: { id: { in: ['g1'] }, venueId: 'v1', deletedAt: null },
    })
  })

  it('rejects a department from another venue', async () => {
    db.department.count.mockResolvedValue(0)
    await expect(
      validateWorkerTaskRefs({ venueId: 'v1', departmentId: 'other-dept' }),
    ).resolves.toBe('DEPARTMENT IS NOT IN THIS VENUE')
  })

  it('rejects a section from another venue', async () => {
    db.section.count.mockResolvedValue(0)
    await expect(
      validateWorkerTaskRefs({ venueId: 'v1', sectionId: 'other-section' }),
    ).resolves.toBe('SECTION IS NOT IN THIS VENUE')
  })

  it('rejects any Guide from another venue', async () => {
    db.guide.count.mockResolvedValue(1)
    await expect(
      validateWorkerTaskRefs({ venueId: 'v1', guideIds: ['g1', 'other-guide'] }),
    ).resolves.toBe('ONE OR MORE GUIDES ARE NOT IN THIS VENUE')
  })

  it('dedupes guide ids before checking ownership', async () => {
    db.guide.count.mockResolvedValue(1)
    await expect(
      validateWorkerTaskRefs({ venueId: 'v1', guideIds: ['g1', 'g1'] }),
    ).resolves.toBeNull()
    expect(db.guide.count).toHaveBeenCalledWith({
      where: { id: { in: ['g1'] }, venueId: 'v1', deletedAt: null },
    })
  })

  it('does no lookups when no refs were sent', async () => {
    await expect(validateWorkerTaskRefs({ venueId: 'v1' })).resolves.toBeNull()
    expect(db.department.count).not.toHaveBeenCalled()
    expect(db.section.count).not.toHaveBeenCalled()
    expect(db.guide.count).not.toHaveBeenCalled()
  })
})
