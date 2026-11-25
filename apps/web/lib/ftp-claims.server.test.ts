import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  typeFindFirst,
  memberFindFirst,
  claimFindMany,
  claimCreate,
  claimUpdate,
  venueFindUnique,
  plateFindFirst,
  plateCreate,
  plateUpdate,
  plateCount,
  claimWithVpermit,
  writeFtpEvidence,
  createManualToken,
} = vi.hoisted(() => ({
  typeFindFirst: vi.fn(),
  memberFindFirst: vi.fn(),
  claimFindMany: vi.fn(),
  claimCreate: vi.fn(),
  claimUpdate: vi.fn(),
  venueFindUnique: vi.fn(),
  plateFindFirst: vi.fn(),
  plateCreate: vi.fn(),
  plateUpdate: vi.fn(),
  plateCount: vi.fn(),
  claimWithVpermit: vi.fn(),
  writeFtpEvidence: vi.fn(),
  createManualToken: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({
  Prisma: { JsonNull: null },
  prisma: {
    ftpParkingType: { findFirst: typeFindFirst },
    member: { findFirst: memberFindFirst },
    ftpClaim: { findMany: claimFindMany, create: claimCreate, update: claimUpdate },
    venue: { findUnique: venueFindUnique },
    memberPlate: {
      findFirst: plateFindFirst,
      create: plateCreate,
      update: plateUpdate,
      count: plateCount,
    },
  },
}))
vi.mock('./vpermit.server', () => ({ claimWithVpermit }))
vi.mock('./ftp-evidence.server', () => ({ writeFtpEvidence }))
vi.mock('./ftp-credentials.server', () => ({ createManualToken }))

import { submitFtpClaim } from './ftp-claims.server'

const TYPE = {
  id: 't1',
  venueId: 'v1',
  name: 'RAYC',
  claimUrl: 'https://vpermit.com.au/tld/ClaimableEvents/Claim?code=12345',
  claimCode: '12345',
  logPlates: true,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  useContactEmail: true,
  useContactPhone: true,
}

const MEMBER = {
  id: 'm1',
  venueId: 'v1',
  membershipNumber: '1234',
  firstName: 'TEST',
  lastName: 'MEMBER',
  email: null,
  phone: null,
  savePlates: true,
}

const CLAIM_RESULT = {
  status: 'CONFIRMED',
  ok: true,
  message: 'PARKING CONFIRMED',
  httpStatus: 200,
  validFrom: null,
  validUntil: null,
  locations: [],
  confirmationText: null,
  durationMs: 5,
  screenshot: null,
  html: null,
}

function submit() {
  return submitFtpClaim({
    venueId: 'v1',
    typeId: 't1',
    memberId: 'm1',
    credentialKind: 'MEMBER',
    plate: 'ABC12',
    timezone: 'Pacific/Auckland',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  typeFindFirst.mockResolvedValue(TYPE)
  memberFindFirst.mockResolvedValue(MEMBER)
  claimFindMany.mockResolvedValue([])
  claimCreate.mockResolvedValue({ id: 'c1' })
  claimUpdate.mockResolvedValue({})
  venueFindUnique.mockResolvedValue({ name: 'VENUE', timezone: 'Pacific/Auckland' })
  plateFindFirst.mockResolvedValue(null)
  plateCount.mockResolvedValue(0)
  plateCreate.mockResolvedValue({})
  claimWithVpermit.mockResolvedValue(CLAIM_RESULT)
  writeFtpEvidence.mockResolvedValue({ pdfPath: null, imagePath: null, htmlPath: null })
  createManualToken.mockResolvedValue('manual-token')
})

describe('submitFtpClaim plate memory', () => {
  it('remembers a plate when both the member and type allow it', async () => {
    const result = await submit()
    expect(result.status).toBe('CONFIRMED')
    expect(plateFindFirst).toHaveBeenCalledWith({
      where: { memberId: 'm1', plate: 'ABC12' },
    })
    expect(plateCreate).toHaveBeenCalledWith({
      data: {
        venueId: 'v1',
        memberId: 'm1',
        plate: 'ABC12',
        isDefault: true,
      },
    })
  })

  it('does not remember a plate when the member turned saving off', async () => {
    memberFindFirst.mockResolvedValue({ ...MEMBER, savePlates: false })
    const result = await submit()
    expect(result.status).toBe('CONFIRMED')
    expect(plateFindFirst).not.toHaveBeenCalled()
    expect(plateCreate).not.toHaveBeenCalled()
  })

  it('does not remember a plate when the type stops logging plates', async () => {
    typeFindFirst.mockResolvedValue({ ...TYPE, logPlates: false })
    const result = await submit()
    expect(result.status).toBe('CONFIRMED')
    expect(claimFindMany).not.toHaveBeenCalled()
    expect(plateFindFirst).not.toHaveBeenCalled()
    expect(plateCreate).not.toHaveBeenCalled()
  })
})
