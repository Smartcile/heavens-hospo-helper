import { describe, it, expect } from 'vitest'
import { appendHistoryEvent } from './gift-card-history'

describe('appendHistoryEvent', () => {
  it('appends events to a fresh or existing history', () => {
    const at = new Date('2026-09-08T00:00:00Z')
    const first = appendHistoryEvent(undefined, 'CREATED', 'AUTO-CREATED FROM WOOCOMMERCE ORDER #987', at)
    expect(first).toHaveLength(1)
    expect(first[0]).toEqual({ at: at.toISOString(), type: 'CREATED', note: 'AUTO-CREATED FROM WOOCOMMERCE ORDER #987' })

    const second = appendHistoryEvent(first, 'ISSUED', 'PDF GENERATED', at)
    expect(second).toHaveLength(2)
    expect(second[1].type).toBe('ISSUED')
  })

  it('caps the history at 200 events (newest kept)', () => {
    let history: ReturnType<typeof appendHistoryEvent> = []
    for (let i = 0; i < 250; i++) {
      history = appendHistoryEvent(history, 'STATUS', `EVENT ${i}`)
    }
    expect(history).toHaveLength(200)
    expect(history[0].note).toBe('EVENT 50')
    expect(history[199].note).toBe('EVENT 249')
  })

  it('tolerates a malformed stored history', () => {
    const history = appendHistoryEvent([{ bogus: true } as never], 'NOTE', 'fine')
    expect(history).toHaveLength(2)
    expect(history[1].type).toBe('NOTE')
  })
})
