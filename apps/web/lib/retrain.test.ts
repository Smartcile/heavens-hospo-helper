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

  it('writes the supplied audiences as NoticeAudience rows', async () => {
    await postRetrainNotice({
      venueId: 'v1',
      departmentId: null,
      title: 'BAR OPEN',
      audiences: [
        { kind: 'SECTION', targetId: 's1' },
        { kind: 'POSITION', targetId: 'p1' },
      ],
    })

    const call = mockNoticeCreate.mock.calls[0][0]
    expect(call.data.departmentId).toBeNull()
    expect(call.data.audiences).toEqual({
      create: [
        { kind: 'SECTION', targetId: 's1' },
        { kind: 'POSITION', targetId: 'p1' },
      ],
    })
  })

  it('drops unknown / duplicate audiences and omits the relation when empty', async () => {
    await postRetrainNotice({
      venueId: 'v1',
      departmentId: 'd1',
      title: 'COFFEE CLEAN',
      audiences: [
        { kind: 'SECTION', targetId: 's1' },
        { kind: 'SECTION', targetId: 's1' },
        { kind: 'BOGUS', targetId: 'x1' },
      ],
    })

    const call = mockNoticeCreate.mock.calls[0][0]
    expect(call.data.departmentId).toBe('d1')
    expect(call.data.audiences).toEqual({ create: [{ kind: 'SECTION', targetId: 's1' }] })

    mockNoticeCreate.mockClear()
    await postRetrainNotice({ venueId: 'v1', departmentId: null, title: 'BAR OPEN' })
    expect(mockNoticeCreate.mock.calls[0][0].data).not.toHaveProperty('audiences')
  })
})
