import { describe, it, expect, vi } from 'vitest'

vi.mock('@hospo-ops/db', () => ({ prisma: {}, Prisma: {} }))
vi.mock('@/lib/public-api', () => ({ hashApiKey: (s: string) => s }))
vi.mock('@/lib/beo-blocks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/beo-blocks')>('@/lib/beo-blocks')
  return actual
})

import { buildEventData } from './events.server'

describe('buildEventData', () => {
  it('accepts an areaId (the room the event occupies)', () => {
    const { data, error } = buildEventData({ areaId: 'a1' })
    expect(error).toBeUndefined()
    expect(data.areaId).toBe('a1')
  })

  it('clears the room when areaId is blank or null', () => {
    expect(buildEventData({ areaId: '' }).data.areaId).toBeNull()
    expect(buildEventData({ areaId: null }).data.areaId).toBeNull()
  })

  it('leaves the room untouched when areaId is omitted', () => {
    expect(buildEventData({ name: 'WEDDING' }).data).not.toHaveProperty('areaId')
  })
})
