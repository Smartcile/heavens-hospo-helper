import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db } = vi.hoisted(() => ({
  db: { imageAnnotation: { findMany: vi.fn() } },
}))

vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { guideStepsWrite, loadStepAnnotations, stepAnnotationsFor } from './guides.server'

// Client-generated step ids must be persisted verbatim, because a step's photo
// annotation layers are keyed by `guide-step:<id>` BEFORE the guide is saved.
describe('guideStepsWrite', () => {
  it('creates a new step with its client-generated id', () => {
    const write = guideStepsWrite([{ id: 'client-uuid', heading: 'H', content: 'C' }], [])
    expect(write.create).toHaveLength(1)
    expect(write.create[0]).toMatchObject({ id: 'client-uuid' })
    expect(write.update).toHaveLength(0)
  })

  it('creates without an id when the client did not supply one', () => {
    const write = guideStepsWrite([{ heading: 'H', content: 'C' }], [])
    expect(write.create[0].id).toBeUndefined()
  })

  it('updates an existing step by id and never rewrites its id', () => {
    const write = guideStepsWrite([{ id: 's1', heading: 'H', content: 'C' }], ['s1'])
    expect(write.update[0].where).toEqual({ id: 's1' })
    expect(write.create).toHaveLength(0)
    expect('id' in write.update[0].data).toBe(false)
  })
})

// Regression for the worker guide popup: the read route used to resolve step
// links but never load ImageAnnotation rows, so the popup rendered every photo
// without its overlay.
describe('loadStepAnnotations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.imageAnnotation.findMany.mockResolvedValue([])
  })

  it('batches one query for every step and keys layers by step id', async () => {
    db.imageAnnotation.findMany.mockResolvedValue([
      {
        usageKey: 'guide-step:s1',
        imageUrl: '/uploads/a.png',
        data: { shapes: [{ tool: 'pen', points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }], texts: [] },
      },
      {
        usageKey: 'guide-step:s2',
        imageUrl: '/uploads/b.png',
        data: { shapes: [], texts: [{ x: 0.3, y: 0.3, text: 'CHECK SEAL', size: 0.05 }] },
      },
    ])

    const byStep = await loadStepAnnotations(['s1', 's2', 's1'])

    expect(db.imageAnnotation.findMany).toHaveBeenCalledTimes(1)
    expect(db.imageAnnotation.findMany).toHaveBeenCalledWith({
      where: {
        usageKey: { in: ['guide-step:s1', 'guide-step:s2'] },
        deletedAt: null,
      },
      select: { usageKey: true, imageUrl: true, data: true },
    })
    expect(byStep.get('s1')).toEqual([
      {
        imageUrl: '/uploads/a.png',
        data: { shapes: [{ tool: 'pen', color: '#EF4444', width: 0.008, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }], texts: [] },
      },
    ])
    expect(byStep.get('s2')?.[0].data.texts[0].text).toBe('CHECK SEAL')
  })

  it('normalises bad JSON instead of throwing', async () => {
    db.imageAnnotation.findMany.mockResolvedValue([
      { usageKey: 'guide-step:s1', imageUrl: '/uploads/a.png', data: { shapes: 'nope', texts: [{ text: '' }] } },
    ])

    const byStep = await loadStepAnnotations(['s1'])

    expect(byStep.get('s1')?.[0].data).toEqual({ shapes: [], texts: [] })
  })

  it('ignores guide-row and guide-level usages that are not step layers', async () => {
    db.imageAnnotation.findMany.mockResolvedValue([
      { usageKey: 'guide-row:r1:image', imageUrl: '/uploads/row.png', data: { shapes: [], texts: [] } },
      { usageKey: 'guide-level', imageUrl: '/uploads/guide.png', data: { shapes: [], texts: [] } },
      { usageKey: 'guide-step:s1', imageUrl: '/uploads/a.png', data: { shapes: [], texts: [] } },
    ])

    const byStep = await loadStepAnnotations(['s1'])

    expect([...byStep.keys()]).toEqual(['s1'])
    expect(byStep.get('s1')).toHaveLength(1)
  })

  it('returns an empty map without querying when there are no steps', async () => {
    const byStep = await loadStepAnnotations([])

    expect(byStep.size).toBe(0)
    expect(db.imageAnnotation.findMany).not.toHaveBeenCalled()
    expect(stepAnnotationsFor(byStep, 's1')).toEqual([])
  })
})
