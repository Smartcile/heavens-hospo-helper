import { describe, expect, it, vi } from 'vitest'

const { prisma } = vi.hoisted(() => {
  const empty = () => vi.fn().mockResolvedValue([])
  return {
    prisma: {
      giftCardTemplate: { findMany: empty() },
      giftCard: { findMany: empty() },
      staff: { findMany: empty() },
      taskCompletion: { findMany: empty() },
      trainingStep: { findMany: empty() },
      guideStep: { findMany: empty() },
      inventoryItem: { findMany: empty() },
      menuItem: { findMany: empty() },
      breachNotice: { findMany: empty() },
    },
  }
})

vi.mock('@hospo-ops/db', () => ({ prisma }))

import { fileUsages, fileUsagesForNames } from './file-usage'

const breach = {
  id: 'b1',
  numberplate: 'ABC123',
  breachDate: new Date('2026-11-01T00:00:00Z'),
  attachmentUrls: ['/api/upload/abc-photo.jpg'],
}

describe('fileUsages breach notices', () => {
  it('reports a breach attachment as in use', async () => {
    prisma.breachNotice.findMany.mockResolvedValue([breach])
    const usages = await fileUsages('abc-photo.jpg')
    expect(usages).toContainEqual({
      kind: 'breach-notice',
      label: 'BREACH NOTICE ATTACHMENT',
      ref: 'ABC123 2026-11-01',
      id: 'b1',
    })
  })

  it('groups breach attachments for the file browser', async () => {
    prisma.breachNotice.findMany.mockResolvedValue([breach])
    const grouped = await fileUsagesForNames(['abc-photo.jpg', 'other.jpg'])
    expect(grouped['abc-photo.jpg']).toContainEqual(
      expect.objectContaining({ kind: 'breach-notice', id: 'b1' }),
    )
    expect(grouped['other.jpg']).toBeUndefined()
  })
})
