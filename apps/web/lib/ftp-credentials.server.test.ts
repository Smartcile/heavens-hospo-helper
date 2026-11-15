import { beforeEach, describe, expect, it, vi } from 'vitest'

const { typeFindFirst, memberFindFirst, compare } = vi.hoisted(() => ({
  typeFindFirst: vi.fn(),
  memberFindFirst: vi.fn(),
  compare: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    ftpParkingType: { findFirst: typeFindFirst },
    member: { findFirst: memberFindFirst },
  },
}))
vi.mock('bcryptjs', () => ({ default: { compare }, compare }))

import { resolveFtpCredential } from './ftp-credentials.server'

const TYPE = {
  id: 't1',
  venueId: 'v1',
  name: 'RAYC',
  claimUrl: 'https://vpermit.com.au/tld/ClaimableEvents/Claim?code=ABC',
  adminPinEnabled: true,
  adminPinHash: 'hash',
  adminPinHint: '34',
}

beforeEach(() => {
  vi.clearAllMocks()
  typeFindFirst.mockResolvedValue(TYPE)
  memberFindFirst.mockResolvedValue(null)
  compare.mockResolvedValue(false)
})

describe('resolveFtpCredential', () => {
  it('uses a membership number in member mode', async () => {
    memberFindFirst.mockResolvedValue({
      id: 'm1',
      membershipNumber: '1234',
      firstName: 'TEST',
      lastName: 'MEMBER',
      plates: [],
    })

    const result = await resolveFtpCredential({
      venueId: 'v1',
      typeId: 't1',
      credential: '1234',
      mode: 'MEMBER',
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.credential.kind).toBe('MEMBER')
    expect(compare).not.toHaveBeenCalled()
  })

  it('never falls back to the admin PIN in member mode', async () => {
    compare.mockResolvedValue(true)

    const result = await resolveFtpCredential({
      venueId: 'v1',
      typeId: 't1',
      credential: '1234',
      mode: 'MEMBER',
    })

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(compare).not.toHaveBeenCalled()
  })

  it('uses the admin PIN in admin mode', async () => {
    compare.mockResolvedValue(true)

    const result = await resolveFtpCredential({
      venueId: 'v1',
      typeId: 't1',
      credential: '1234',
      mode: 'ADMIN',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.credential.kind).toBe('ADMIN_PIN')
      expect(result.credential.member).toBeNull()
    }
    expect(memberFindFirst).not.toHaveBeenCalled()
    expect(compare).toHaveBeenCalledWith('1234', 'hash')
  })

  it('rejects a wrong admin PIN in admin mode', async () => {
    const result = await resolveFtpCredential({
      venueId: 'v1',
      typeId: 't1',
      credential: '1234',
      mode: 'ADMIN',
    })

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })
})
