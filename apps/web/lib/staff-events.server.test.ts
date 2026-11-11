import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  materialiseStaffEventInvites,
  staffEventNoticeBody,
  syncStaffEventNotice,
  type StaffEventWithAudiences,
} from './staff-events.server'

const tx = {
  staff: { findMany: vi.fn() },
  staffEventInvite: { findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
  notice: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}

type TxArg = Parameters<typeof materialiseStaffEventInvites>[0]

const event: StaffEventWithAudiences = {
  id: 'e1',
  venueId: 'v1',
  title: 'TEAM BRIEFING',
  description: 'Monthly briefing',
  location: 'FUNCTION ROOM',
  startsAt: new Date('2026-11-12T18:00:00Z'),
  endsAt: new Date('2026-11-12T20:00:00Z'),
  allDay: false,
  attendanceRequired: true,
  status: 'PUBLISHED',
  audiences: [{ kind: 'DEPARTMENT', targetId: 'kitchen' }],
}

const staff = [
  { id: 'a', departmentId: 'kitchen', sections: [], positions: [] },
  { id: 'b', departmentId: 'bar', sections: [], positions: [] },
]

beforeEach(() => {
  vi.clearAllMocks()
  tx.staff.findMany.mockResolvedValue(staff)
  tx.staffEventInvite.findMany.mockResolvedValue([])
  tx.staffEventInvite.updateMany.mockResolvedValue({ count: 0 })
  tx.staffEventInvite.upsert.mockResolvedValue({})
  tx.notice.findUnique.mockResolvedValue(null)
  tx.notice.create.mockResolvedValue({})
  tx.notice.update.mockResolvedValue({})
})

describe('materialiseStaffEventInvites', () => {
  it('creates an invite for every person matching the audience', async () => {
    const result = await materialiseStaffEventInvites(tx as unknown as TxArg, event)
    expect(result).toEqual({ invited: 1, removed: 0 })
    expect(tx.staffEventInvite.upsert).toHaveBeenCalledTimes(1)
    expect(tx.staffEventInvite.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { staffEventId_staffId: { staffEventId: 'e1', staffId: 'a' } },
      update: { deletedAt: null },
    }))
    expect(tx.staffEventInvite.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ staffId: { notIn: ['a'] } }),
    }))
  })

  it('unions explicit people with the audience and revives them', async () => {
    tx.staffEventInvite.findMany.mockResolvedValue([{ staffId: 'b', response: 'DECLINED' }])
    const result = await materialiseStaffEventInvites(tx as unknown as TxArg, event, ['b'])
    expect(result.invited).toBe(2)
    expect(tx.staffEventInvite.upsert).toHaveBeenCalledTimes(2)
  })

  it('retires a pending invite when the manager clears explicit people and changes the audience', async () => {
    tx.staffEventInvite.findMany.mockResolvedValue([{ staffId: 'b', response: 'PENDING' }])
    const result = await materialiseStaffEventInvites(tx as unknown as TxArg, event, [])
    expect(result.invited).toBe(1)
    expect(tx.staffEventInvite.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ staffId: { notIn: ['a'] } }),
    }))
  })

  it('derives explicit people from existing rows when no explicit list is supplied', async () => {
    tx.staffEventInvite.findMany.mockResolvedValue([{ staffId: 'b', response: 'PENDING' }])
    const result = await materialiseStaffEventInvites(tx as unknown as TxArg, event)
    expect(result.invited).toBe(2)
    expect(tx.staffEventInvite.upsert).toHaveBeenCalledTimes(2)
  })

  it('clearing every specific person on an audience-less event falls back to the whole venue', async () => {
    tx.staffEventInvite.findMany.mockResolvedValue([{ staffId: 'b', response: 'PENDING' }])
    const result = await materialiseStaffEventInvites(tx as unknown as TxArg, { ...event, audiences: [] }, [])
    expect(result.invited).toBe(2)
    expect(tx.staffEventInvite.upsert).toHaveBeenCalledTimes(2)
  })

  it('treats existing invites as the explicit list when there are no audiences', async () => {
    tx.staffEventInvite.findMany.mockResolvedValue([{ staffId: 'b', response: 'PENDING' }])
    const explicitOnly = { ...event, audiences: [] }
    const result = await materialiseStaffEventInvites(tx as unknown as TxArg, explicitOnly)
    expect(result.invited).toBe(1)
    expect(tx.staffEventInvite.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { staffEventId_staffId: { staffEventId: 'e1', staffId: 'b' } },
    }))
  })

  it('whole venue when there are no audiences and no existing invites', async () => {
    const result = await materialiseStaffEventInvites(tx as unknown as TxArg, { ...event, audiences: [] })
    expect(result.invited).toBe(2)
    expect(tx.staffEventInvite.upsert).toHaveBeenCalledTimes(2)
  })
})

describe('syncStaffEventNotice', () => {
  it('creates a pinned IMPORTANT notice without a GOT IT acknowledgement', async () => {
    await syncStaffEventNotice(tx as unknown as Parameters<typeof syncStaffEventNotice>[0], event)
    const data = tx.notice.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      venueId: 'v1',
      staffEventId: 'e1',
      title: 'TEAM BRIEFING',
      priority: 'IMPORTANT',
      pinned: true,
      requiresAck: false,
      isActive: true,
      audiences: { create: [{ kind: 'DEPARTMENT', targetId: 'kitchen' }] },
    })
  })

  it('updates the existing notice and replaces its audiences', async () => {
    tx.notice.findUnique.mockResolvedValue({ id: 'n1' })
    await syncStaffEventNotice(tx as unknown as Parameters<typeof syncStaffEventNotice>[0], event)
    expect(tx.notice.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'n1' },
      data: expect.objectContaining({ audiences: { deleteMany: {}, create: [{ kind: 'DEPARTMENT', targetId: 'kitchen' }] } }),
    }))
    expect(tx.notice.create).not.toHaveBeenCalled()
  })

  it('does nothing for a DRAFT event', async () => {
    await syncStaffEventNotice(tx as unknown as Parameters<typeof syncStaffEventNotice>[0], { ...event, status: 'DRAFT' })
    expect(tx.notice.create).not.toHaveBeenCalled()
    expect(tx.notice.update).not.toHaveBeenCalled()
  })
})

describe('staffEventNoticeBody', () => {
  it('includes the time, location, required flag and description', () => {
    const body = staffEventNoticeBody(event)
    expect(body).toContain('2026-11-12 18:00–20:00')
    expect(body).toContain('FUNCTION ROOM')
    expect(body).toContain('ATTENDANCE REQUIRED')
    expect(body).toContain('Monthly briefing')
  })
})
