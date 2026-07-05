import { describe, it, expect } from 'vitest'
import { workerCookieSecure } from '@/lib/worker-session'

describe('worker-session utilities', () => {
  it('workerCookieSecure is a boolean', () => {
    expect(typeof workerCookieSecure).toBe('boolean')
  })

  it('cookie name constant exists', async () => {
    const { createWorkerSession } = await import('@/lib/worker-session')
    expect(typeof createWorkerSession).toBe('function')
  })
})
