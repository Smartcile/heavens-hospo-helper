import { describe, expect, it } from 'vitest'
import {
  groupTasksBySection,
  taskSectionPrefix,
  taskSectionTitle,
} from '@/lib/task-section-label'

describe('taskSectionPrefix', () => {
  it('uses the primary section name', () => {
    expect(taskSectionPrefix({ sectionId: 's1', section: { id: 's1', name: 'BAR' } })).toBe('[BAR]')
  })

  it('counts extra sections on a multi-section task', () => {
    expect(
      taskSectionPrefix({
        sectionId: 's1',
        section: { id: 's1', name: 'BAR' },
        sectionIds: ['s1', 's2', 's3'],
      }),
    ).toBe('[BAR +2]')
  })

  it('counts extras from the checklist card sectionCount', () => {
    expect(taskSectionPrefix({ sectionName: 'BAR', sectionCount: 3 })).toBe('[BAR +2]')
  })

  it('prefers sectionIds over sectionCount', () => {
    expect(
      taskSectionPrefix({ sectionName: 'BAR', sectionIds: ['s1', 's2'], sectionCount: 5 }),
    ).toBe('[BAR +1]')
  })

  it('says NO SECTION when the task has none', () => {
    expect(taskSectionPrefix({ sectionId: null, section: null })).toBe('[NO SECTION]')
  })

  it('falls back to SECTION when the relation is missing but an id is set', () => {
    expect(taskSectionPrefix({ sectionId: 'gone', section: null })).toBe('[SECTION]')
  })

  it('accepts the checklist card view model (sectionName only)', () => {
    expect(taskSectionPrefix({ sectionName: 'KITCHEN' })).toBe('[KITCHEN]')
  })

  it('titles the tooltip', () => {
    expect(taskSectionTitle({ section: { name: 'bar' } })).toBe('BAR')
    expect(taskSectionTitle({ sectionId: 'gone', section: null })).toBe('SECTION')
    expect(taskSectionTitle({})).toBe('NO SECTION')
  })
})

describe('groupTasksBySection', () => {
  it('orders by department then section and puts NO SECTION last', () => {
    const tasks = [
      { id: '1', title: 'NO SEC', departmentId: 'd1' },
      { id: '2', title: 'BAR TASK', sectionId: 'sb', section: { id: 'sb', name: 'BAR' }, department: { name: 'FOH' } },
      { id: '3', title: 'KITCHEN TASK', sectionId: 'sk', section: { id: 'sk', name: 'KITCHEN' }, department: { name: 'BOH' } },
    ]

    const groups = groupTasksBySection(tasks)

    expect(groups.map((g) => g.label)).toEqual(['KITCHEN', 'BAR', 'NO SECTION'])
    expect(groups.find((g) => g.label === 'NO SECTION')!.tasks.map((t) => t.id)).toEqual(['1'])
  })

  it('merges same-section tasks and keeps the primary section name', () => {
    const groups = groupTasksBySection([
      { id: '1', sectionId: 'sb', section: { id: 'sb', name: 'BAR' }, department: { name: 'FOH' } },
      { id: '2', sectionId: 'sb', section: { id: 'sb', name: 'BAR' }, department: { name: 'FOH' } },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['1', '2'])
  })

  it('merges every unresolvable section id into one SECTION group', () => {
    const groups = groupTasksBySection([
      { id: '1', sectionId: 'gone-a', section: null, department: { name: 'FOH' } },
      { id: '2', sectionId: 'gone-b', section: null, department: { name: 'BOH' } },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('SECTION')
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['1', '2'])
  })
})
