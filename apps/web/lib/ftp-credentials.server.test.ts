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

import {
  CREDENTIAL_TTL,
  ftpCredentialPublicView,
  resolveFtpCredential,
  type FtpCredential,
} from './ftp-credentials.server'

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

describe('credential token lifetime', () => {
  it('lasts ten minutes so a member can manage saved plates', () => {
    expect(CREDENTIAL_TTL).toBe('10m')
  })
})

describe('ftpCredentialPublicView', () => {
  const type = {
    id: 't1',
    venueId: 'v1',
    name: 'RAYC',
    windowLabel: '4 HOURS',
    durationMinutes: 240,
    logPlates: true,
    plateRemovalRequiresPin: true,
  } as unknown as FtpCredential['type']

  const plate = {
    id: 'p1',
    venueId: 'v1',
    memberId: 'm1',
    plate: 'ABC123',
    isDefault: true,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  }

  function member(savePlates: boolean): FtpCredential['member'] {
    return {
      id: 'm1',
      venueId: 'v1',
      membershipNumber: '1234',
      firstName: 'TEST',
      lastName: 'MEMBER',
      email: null,
      phone: null,
      parkingTypeId: 't1',
      customerGroupId: null,
      isActive: true,
      isTest: false,
      savePlates,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      plates: [plate],
    } as unknown as FtpCredential['member']
  }

  it('exposes the saved plates and saving state when saving is on', () => {
    const view = ftpCredentialPublicView({
      kind: 'MEMBER',
      type,
      member: member(true),
    } as unknown as FtpCredential)
    expect(view.type.plateRemovalRequiresPin).toBe(true)
    expect(view.member).toMatchObject({
      plateSavingEnabled: true,
      plates: [{ id: 'p1', plate: 'ABC123', isDefault: true }],
    })
  })

  it('hides existing plates when the member has turned saving off', () => {
    const view = ftpCredentialPublicView({
      kind: 'MEMBER',
      type,
      member: member(false),
    } as unknown as FtpCredential)
    expect(view.member).toMatchObject({ plateSavingEnabled: false, plates: [] })
  })

  it('hides plates when the type stops logging plates', () => {
    const view = ftpCredentialPublicView({
      kind: 'MEMBER',
      type: { ...type, logPlates: false },
      member: member(true),
    } as unknown as FtpCredential)
    expect(view.member).toMatchObject({ plateSavingEnabled: false, plates: [] })
  })

  it('has no member for the admin PIN flow', () => {
    const view = ftpCredentialPublicView({ kind: 'ADMIN_PIN', type, member: null })
    expect(view.member).toBeNull()
    expect(view.type.plateRemovalRequiresPin).toBe(true)
  })
})
