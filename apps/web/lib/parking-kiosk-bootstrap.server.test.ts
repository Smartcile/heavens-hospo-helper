import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getKioskSession, ftpHealthForVenue, ftpSettingsView } = vi.hoisted(() => ({
  prisma: {
    ftpSettings: { findUnique: vi.fn(), findFirst: vi.fn() },
    parkingConfig: { findUnique: vi.fn() },
    venue: { findUnique: vi.fn() },
    ftpParkingType: { findMany: vi.fn() },
  },
  getKioskSession: vi.fn(),
  ftpHealthForVenue: vi.fn(),
  ftpSettingsView: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('./parking-kiosk.server', () => ({ getKioskSession }))
vi.mock('./ftp-health-state.server', () => ({ ftpHealthForVenue }))
vi.mock('./ftp-settings', () => ({ ftpSettingsView }))

import { loadKioskBootstrap } from './parking-kiosk-bootstrap.server'

beforeEach(() => {
  vi.clearAllMocks()
  getKioskSession.mockResolvedValue({ venueId: 'v1', codeHash: 'hash' })
  prisma.ftpSettings.findUnique.mockResolvedValue({
    venueId: 'v1',
    kioskEnabled: true,
    kioskRequireCode: false,
    kioskCodeHash: 'hash',
    deletedAt: null,
    updatedAt: new Date('2026-11-01T00:00:00Z'),
  })
  prisma.parkingConfig.findUnique.mockResolvedValue({
    enabled: true,
    deletedAt: null,
    carparkId: '123',
    carparkName: 'CARPARK',
    durationMinutes: 90,
  })
  prisma.venue.findUnique.mockResolvedValue({ name: 'VENUE', timezone: 'Pacific/Auckland' })
  prisma.ftpParkingType.findMany.mockResolvedValue([
    { id: 't1', name: 'RAYC', windowLabel: null, durationMinutes: 240 },
  ])
  ftpHealthForVenue.mockResolvedValue([])
  ftpSettingsView.mockReturnValue({ kioskAutoResetSeconds: 60 })
})

describe('loadKioskBootstrap', () => {
  it('only includes parking types marked SHOW ON KIOSK', async () => {
    const result = await loadKioskBootstrap()
    expect(result.locked).toBe(false)
    expect(prisma.ftpParkingType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          venueId: 'v1',
          isActive: true,
          showOnKiosk: true,
          deletedAt: null,
          claimUrl: { not: null },
        }),
      }),
    )
    if (!result.locked) {
      expect(result.config.fourHourTypes.map((type) => type.id)).toEqual(['t1'])
    }
  })
})
