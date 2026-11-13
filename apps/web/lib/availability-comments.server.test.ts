import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db } = vi.hoisted(() => ({
  db: {
    availabilityComment: { findFirst: vi.fn() },
    staffAvailability: { updateMany: vi.fn() },
  },
}))

vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { mirrorAvailabilityCommentNotes } from '@/lib/availability-comments.server'

beforeEach(() => {
  vi.clearAllMocks()
  db.staffAvailability.updateMany.mockResolvedValue({ count: 1 })
})

describe('mirrorAvailabilityCommentNotes', () => {
  it('writes the newest live comment body onto the availability day', async () => {
    db.availabilityComment.findFirst.mockResolvedValue({ body: 'LATEST' })

    await mirrorAvailabilityCommentNotes('st1', '2026-11-12')

    expect(db.availabilityComment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        staffId: 'st1',
        date: new Date('2026-11-12T00:00:00.000Z'),
        deletedAt: null,
      },
    }))
    expect(db.staffAvailability.updateMany).toHaveBeenCalledWith({
      where: { staffId: 'st1', date: new Date('2026-11-12T00:00:00.000Z'), deletedAt: null },
      data: { notes: 'LATEST' },
    })
  })

  it('clears the note when the last live comment was deleted', async () => {
    db.availabilityComment.findFirst.mockResolvedValue(null)

    await mirrorAvailabilityCommentNotes('st1', '2026-11-12')

    expect(db.staffAvailability.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { notes: null },
    }))
  })
})
