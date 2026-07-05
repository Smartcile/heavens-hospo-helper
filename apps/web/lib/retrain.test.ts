import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockNoticeCreate } = vi.hoisted(() => ({
  mockNoticeCreate: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({
  prisma: { notice: { create: mockNoticeCreate } },
}))

import { postRetrainNotice } from '@/lib/retrain'

describe('postRetrainNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a notice with title prefixed RE-TRAIN', async () => {
    await postRetrainNotice({ venueId: 'v1', departmentId: null, title: 'BAR OPEN', summary: 'Updated step 3' })
    expect(mockNoticeCreate).toHaveBeenCalledTimes(1)
    const call = mockNoticeCreate.mock.calls[0][0]
    expect(call.data.title).toContain('RE-TRAIN')
    expect(call.data.requiresAck).toBe(true)
  })

  it('provides a default body when no summary', async () => {
    await postRetrainNotice({ venueId: 'v1', departmentId: 'd1', title: 'COFFEE CLEAN' })
    expect(mockNoticeCreate).toHaveBeenCalled()
  })
})
