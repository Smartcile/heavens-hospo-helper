import { describe, it, expect } from 'vitest'
import {
  runAreaMigration,
  type AreaMigrationFeed,
  type AreaMigrationStore,
} from '../../../packages/db/prisma/area-migration'

function feed(over: Partial<AreaMigrationFeed> = {}): AreaMigrationFeed {
  return {
    id: 'f1',
    venueId: 'v1',
    areaId: null,
    name: 'TE KAWAU ROOM',
    colour: null,
    floorPlanId: null,
    sortOrder: 0,
    notes: null,
    roomDismissed: false,
    ...over,
  }
}

function fakeStore(rows: AreaMigrationFeed[], eventsPerFeed = 0) {
  const feeds = rows.map((r) => ({ ...r }))
  const areaIds: string[] = []
  const dismissed: string[] = []
  let seq = 0

  const store: AreaMigrationStore = {
    listUnassignedFeeds: async () => feeds.filter((f) => f.areaId === null),
    createAreaForFeed: async () => {
      const id = `area-${++seq}`
      areaIds.push(id)
      return id
    },
    linkFeedToArea: async (feedId, areaId) => {
      const row = feeds.find((f) => f.id === feedId)
      if (!row) throw new Error(`missing feed ${feedId}`)
      row.areaId = areaId
    },
    dismissFeed: async (feedId) => {
      const row = feeds.find((f) => f.id === feedId)
      if (!row) throw new Error(`missing feed ${feedId}`)
      row.roomDismissed = true
      dismissed.push(feedId)
    },
    listLinkedFeeds: async () =>
      feeds.filter((f) => f.areaId !== null).map((f) => ({ id: f.id, areaId: f.areaId as string })),
    backfillEvents: async () => eventsPerFeed,
  }

  return { store, feeds, areaIds, dismissed }
}

describe('runAreaMigration', () => {
  it('creates a room for a human-authored feed name', async () => {
    const fake = fakeStore([feed({ name: 'TE KAWAU ROOM' })], 2)
    const result = await runAreaMigration(fake.store)
    expect(result.created).toBe(1)
    expect(result.dismissed).toEqual([])
    expect(result.eventsBackfilled).toBe(2)
    expect(fake.feeds[0].areaId).toBe('area-1')
  })

  it('leaves an opaque calendar identifier unassigned and marks it dismissed', async () => {
    const fake = fakeStore([feed({ name: '3f9a2b7c8d1e4f5a6b7c8d9e0f1a2b3c' })])
    const result = await runAreaMigration(fake.store)
    expect(result.created).toBe(0)
    expect(result.dismissed).toEqual(['3f9a2b7c8d1e4f5a6b7c8d9e0f1a2b3c'])
    expect(fake.areaIds).toHaveLength(0)
    expect(fake.feeds[0].areaId).toBeNull()
    expect(fake.feeds[0].roomDismissed).toBe(true)
  })

  it('skips a feed whose room was dismissed', async () => {
    const fake = fakeStore([feed({ roomDismissed: true })])
    const result = await runAreaMigration(fake.store)
    expect(result.created).toBe(0)
    expect(fake.dismissed).toEqual([])
    expect(fake.areaIds).toHaveLength(0)
  })

  it('is a no-op on a second run and never resurrects a deleted room', async () => {
    const fake = fakeStore([feed()])
    const first = await runAreaMigration(fake.store)
    expect(first.created).toBe(1)
    expect(fake.feeds[0].areaId).not.toBeNull()

    const second = await runAreaMigration(fake.store)
    expect(second.created).toBe(0)
    expect(fake.areaIds).toHaveLength(1)

    // A manager deletes the room: the feed is unassigned and dismissed.
    fake.feeds[0].areaId = null
    fake.feeds[0].roomDismissed = true

    const third = await runAreaMigration(fake.store)
    expect(third.created).toBe(0)
    expect(fake.areaIds).toHaveLength(1)
    expect(fake.feeds[0].areaId).toBeNull()
  })
})
