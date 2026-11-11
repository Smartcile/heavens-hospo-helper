import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerSession } from '@hospo-ops/types'

const mocks = vi.hoisted(() => ({
  prisma: { staff: { findUnique: vi.fn() } },
  staffHasPermission: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma: mocks.prisma }))
vi.mock('./permissions', () => ({ staffHasPermission: mocks.staffHasPermission }))

import { workerMayManageGiftCards } from './worker-gift-access'

function session(role: WorkerSession['role']): WorkerSession {
  return {
    staffId: 's1',
    venueId: 'v1',
    departmentId: null,
    firstName: 'SAM',
    role,
    expiresAt: 0,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.staffHasPermission.mockResolvedValue(false)
})

describe('workerMayManageGiftCards', () => {
  it('denies no session', async () => {
    expect(await workerMayManageGiftCards(null)).toBe(false)
  })

  it('always allows ADMIN without a grant lookup', async () => {
    expect(await workerMayManageGiftCards(session('ADMIN'))).toBe(true)
    expect(mocks.prisma.staff.findUnique).not.toHaveBeenCalled()
  })

  it('never allows floor STAFF to reset a card', async () => {
    expect(await workerMayManageGiftCards(session('STAFF'))).toBe(false)
  })

  it('keeps the legacy full access for an unrestricted MANAGER', async () => {
    mocks.prisma.staff.findUnique.mockResolvedValue({ restricted: false })
    expect(await workerMayManageGiftCards(session('MANAGER'))).toBe(true)
    expect(mocks.staffHasPermission).not.toHaveBeenCalled()
  })

  it('requires performance.giftcards.redeem for a restricted MANAGER', async () => {
    mocks.prisma.staff.findUnique.mockResolvedValue({ restricted: true })
    mocks.staffHasPermission.mockResolvedValue(true)
    expect(await workerMayManageGiftCards(session('MANAGER'))).toBe(true)
    expect(mocks.staffHasPermission).toHaveBeenCalledWith('s1', 'v1', 'performance.giftcards.redeem')
  })

  it('denies a restricted MANAGER without the redeem grant', async () => {
    mocks.prisma.staff.findUnique.mockResolvedValue({ restricted: true })
    expect(await workerMayManageGiftCards(session('MANAGER'))).toBe(false)
  })
})
