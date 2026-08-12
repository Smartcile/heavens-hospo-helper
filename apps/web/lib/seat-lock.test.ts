import { describe, it, expect } from 'vitest'
import { withSeatLock } from './seat-lock'

describe('withSeatLock', () => {
  it('runs concurrent calls with the same key strictly one at a time', async () => {
    let active = 0
    let maxActive = 0
    const events: string[] = []

    const fn = async (name: string) => {
      active++
      maxActive = Math.max(maxActive, active)
      events.push(`start:${name}`)
      await new Promise((r) => setTimeout(r, 20))
      events.push(`end:${name}`)
      active--
    }

    await Promise.all([
      withSeatLock('a', () => fn('1')),
      withSeatLock('a', () => fn('2')),
      withSeatLock('a', () => fn('3')),
    ])

    expect(maxActive).toBe(1)
    expect(events).toEqual([
      'start:1', 'end:1',
      'start:2', 'end:2',
      'start:3', 'end:3',
    ])
  })

  it('lets the queued call see the result of the first call', async () => {
    const read = async () => {
      const snapshots: number[] = []
      await Promise.all([
        withSeatLock('k', async () => {
          snapshots.push(await Promise.resolve(1))
        }),
        withSeatLock('k', async () => {
          snapshots.push(await Promise.resolve(2))
        }),
      ])
      return snapshots
    }

    expect(await read()).toEqual([1, 2])
  })

  it('releases the lock when the held call throws', async () => {
    await expect(withSeatLock('k', async () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')

    // The lock must be free again — a follow-up call completes normally.
    const out = await withSeatLock('k', () => Promise.resolve('ok'))
    expect(out).toBe('ok')
  })

  it('keys are independent — calls on different keys run concurrently', async () => {
    let active = 0
    let maxActive = 0

    const fn = async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 20))
      active--
    }

    await Promise.all([
      withSeatLock('x', fn),
      withSeatLock('y', fn),
    ])

    expect(maxActive).toBe(2)
  })
})
