import { describe, it, expect } from 'vitest'
import { emptyHistory, pushHistory, undoHistory, redoHistory, HISTORY_LIMIT } from './floorplan-history'

interface Snapshot {
  elements: { id: string; x: number }[]
  setupItems: { id: string; rotation: number }[]
  zones: { id: string; width: number }[]
}

const base: Snapshot = {
  elements: [{ id: 'e1', x: 0 }],
  setupItems: [{ id: 's1', rotation: 0 }],
  zones: [{ id: 'z1', width: 100 }],
}

describe('floorplan history', () => {
  it('starts empty', () => {
    const h = emptyHistory<Snapshot>()
    expect(h.past).toHaveLength(0)
    expect(h.future).toHaveLength(0)
  })

  it('undoes a move, a resize, a rotate and a delete in order', () => {
    const h = emptyHistory<Snapshot>()
    const states: Snapshot[] = [
      base,
      { ...base, elements: [{ id: 'e1', x: 50 }] },            // move
      { ...base, elements: [{ id: 'e1', x: 50 }], zones: [{ id: 'z1', width: 200 }] }, // resize
      { ...base, elements: [{ id: 'e1', x: 50 }], zones: [{ id: 'z1', width: 200 }], setupItems: [{ id: 's1', rotation: 90 }] }, // rotate
      { ...base, elements: [], zones: [{ id: 'z1', width: 200 }], setupItems: [{ id: 's1', rotation: 90 }] }, // delete
    ]
    // push the state *before* each mutation, as the editor does
    for (let i = 0; i < states.length - 1; i++) pushHistory(h, states[i])

    let current = states[states.length - 1]
    const visited: Snapshot[] = []
    for (let i = states.length - 2; i >= 0; i--) {
      const prev = undoHistory(h, current)
      expect(prev).not.toBeNull()
      current = prev as Snapshot
      visited.push(current)
    }
    expect(visited).toEqual([states[3], states[2], states[1], states[0]])
    expect(current.elements).toEqual([{ id: 'e1', x: 0 }])
    expect(current.setupItems).toEqual([{ id: 's1', rotation: 0 }])
    expect(undoHistory(h, current)).toBeNull()
  })

  it('redo replays what undo took away', () => {
    const h = emptyHistory<Snapshot>()
    const moved: Snapshot = { ...base, elements: [{ id: 'e1', x: 50 }] }
    pushHistory(h, base)
    const undone = undoHistory(h, moved)
    expect(undone).toEqual(base)
    const redone = redoHistory(h, base)
    expect(redone).toEqual(moved)
    expect(redoHistory(h, moved)).toBeNull()
  })

  it('a new mutation after undo forks history (drops redo)', () => {
    const h = emptyHistory<Snapshot>()
    pushHistory(h, base)
    undoHistory(h, { ...base, elements: [{ id: 'e1', x: 50 }] })
    expect(h.future).toHaveLength(1)
    pushHistory(h, base)
    expect(h.future).toHaveLength(0)
  })

  it('caps the stack', () => {
    const h = emptyHistory<Snapshot>()
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) pushHistory(h, base)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
  })
})
