import { describe, it, expect } from 'vitest'
import { guideStepsWrite } from './guides.server'

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
