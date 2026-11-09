import { describe, it, expect } from 'vitest'
import {
  matchGuideRows,
  parseGuideImportAnswer,
  resolveGuideImportRefs,
  type GuideImportRefs,
} from './guide'

function refs(overrides: Partial<GuideImportRefs> = {}): GuideImportRefs {
  return {
    guides: [{ id: 'g1', name: 'EXISTING GUIDE' }],
    folders: [{ id: 'f1', name: 'BARS' }],
    departments: [{ id: 'd1', name: 'FRONT OF HOUSE' }],
    sections: [{ id: 's1', name: 'BAR' }],
    positions: [{ id: 'p1', name: 'BARTENDER' }],
    items: [{ id: 'i1', name: 'DOOR KEY' }],
    tasks: [{ id: 't1', name: 'STOCK FRIDGE' }],
    checklists: [{ id: 'c1', name: 'OPENING' }],
    recipes: [{ id: 'r1', name: 'HOUSE SYRUP' }],
    ...overrides,
  }
}

function parseAndRows(guides: unknown[]) {
  const result = parseGuideImportAnswer(JSON.stringify({ guides }))
  if ('error' in result) throw new Error(result.error)
  return result.rows
}

describe('parseGuideImportAnswer', () => {
  it('parses a JSON guide with audiences, steps and links', () => {
    const rows = parseAndRows([{
      title: 'opening the bar',
      description: 'How to open.',
      category: 'front of house',
      guideType: 'SOP',
      body: 'Intro **text**',
      folder: 'bars',
      tracked: true,
      audiences: [{ kind: 'SECTION', name: 'bar' }],
      steps: [{
        heading: 'unlock',
        content: '- Unlock the doors',
        links: [{ kind: 'ITEM', name: 'door key', qty: 1 }],
      }],
    }])
    const values = rows[0].values
    expect(values.title).toBe('OPENING THE BAR')
    expect(values.guideType).toBe('SOP')
    expect(values.category).toBe('FRONT OF HOUSE')
    expect(values.folderName).toBe('BARS')
    expect(values.isTracked).toBe(true)
    expect(values.audiences).toEqual([{ kind: 'SECTION', name: 'BAR' }])
    expect(values.bodyHtml).toContain('<strong>text</strong>')
    expect(values.steps).toHaveLength(1)
    expect(values.steps[0].contentHtml).toContain('<li>Unlock the doors</li>')
    expect(values.steps[0].links).toEqual([{ kind: 'ITEM', name: 'DOOR KEY', qty: 1, note: null }])
    expect(values.replaceSteps).toBe(false)
  })

  it('parses a Markdown document (H1 title / H2 steps)', () => {
    const result = parseGuideImportAnswer('# MAKING COFFEE\n\n## GRIND\n\n- Set the grinder\n\n## BREW\n\nPour slowly.')
    if ('error' in result) throw new Error(result.error)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].values.title).toBe('MAKING COFFEE')
    expect(result.rows[0].values.steps.map((s) => s.heading)).toEqual(['GRIND', 'BREW'])
    expect(result.rows[0].values.bodyHtml).toBe('')
  })

  it('rejects a Markdown document with no title line', () => {
    expect(parseGuideImportAnswer('## ONLY STEPS')).toEqual({ error: 'MARKDOWN NEEDS A TITLE (AN H1 LINE)' })
  })

  it('flags a PRODUCT_REFERENCE type as an error', () => {
    const rows = parseAndRows([{ title: 'WINE LIST', guideType: 'PRODUCT_REFERENCE', audiences: [] }])
    expect(rows[0].issues.some((i) => i.code === 'PRODUCT_REFERENCE_UNSUPPORTED' && i.severity === 'ERROR')).toBe(true)
  })

  it('marks an in-file duplicate and keeps only the first', () => {
    const rows = parseAndRows([{ title: 'GUIDE' }, { title: 'guide' }])
    expect(rows[1].match?.status).toBe('DUPLICATE_IN_FILE')
    expect(rows[1].action).toBe('SKIP')
  })

  it('treats a plain first line as the title when there is no JSON', () => {
    const result = parseGuideImportAnswer('just some words')
    if ('error' in result) throw new Error(result.error)
    expect(result.rows[0].values.title).toBe('JUST SOME WORDS')
  })

  it('errors when a JSON answer has no guides', () => {
    expect(parseGuideImportAnswer('{"guides": []}')).toEqual({ error: 'NO GUIDES FOUND IN THE ANSWER' })
  })
})

describe('matchGuideRows', () => {
  it('defaults an exact single match to SKIP/MATCH', () => {
    const matched = matchGuideRows(parseAndRows([{ title: 'existing guide' }]), [{ id: 'g1', name: 'EXISTING GUIDE' }])
    expect(matched[0].action).toBe('SKIP')
    expect(matched[0].match).toMatchObject({ status: 'MATCH', targetId: 'g1' })
  })

  it('marks a near copy SIMILAR', () => {
    const matched = matchGuideRows(parseAndRows([{ title: 'EXISTING GUIDES' }]), [{ id: 'g1', name: 'EXISTING GUIDE' }])
    expect(matched[0].match?.status).toBe('SIMILAR')
  })
})

describe('resolveGuideImportRefs', () => {
  it('resolves audiences and links and keeps the row importable', () => {
    const rows = parseAndRows([{
      title: 'OPEN BAR',
      audiences: [{ kind: 'SECTION', name: 'BAR' }],
      steps: [{ heading: 'STEP', content: 'Do it', links: [{ kind: 'ITEM', name: 'DOOR KEY' }] }],
    }])
    const resolved = resolveGuideImportRefs(rows, refs())
    expect(resolved[0].issues.filter((i) => i.severity === 'ERROR')).toHaveLength(0)
    expect(resolved[0].action).toBe('CREATE')
  })

  it('warns NOBODY WILL SEE THIS when there is no audience but does not block', () => {
    const resolved = resolveGuideImportRefs(parseAndRows([{ title: 'NOBODY GUIDE' }]), refs())
    expect(resolved[0].issues.some((i) => i.code === 'NO_AUDIENCE' && i.severity === 'WARNING')).toBe(true)
    expect(resolved[0].action).toBe('CREATE')
  })

  it('flags an unknown audience and skips the row', () => {
    const rows = parseAndRows([{ title: 'GUIDE', audiences: [{ kind: 'DEPARTMENT', name: 'NOWHERE' }] }])
    const resolved = resolveGuideImportRefs(rows, refs())
    expect(resolved[0].issues.some((i) => i.code === 'AUDIENCE_NOT_FOUND')).toBe(true)
    expect(resolved[0].action).toBe('SKIP')
  })

  it('flags an unknown step link and skips the row', () => {
    const rows = parseAndRows([{ title: 'GUIDE', steps: [{ heading: 'S', content: 'c', links: [{ kind: 'TASK', name: 'NOPE' }] }] }])
    const resolved = resolveGuideImportRefs(rows, refs())
    expect(resolved[0].issues.some((i) => i.code === 'LINK_NOT_FOUND')).toBe(true)
    expect(resolved[0].action).toBe('SKIP')
  })

  it('notes a folder that will be created', () => {
    const resolved = resolveGuideImportRefs(parseAndRows([{ title: 'GUIDE', folder: 'NEW FOLDER' }]), refs())
    expect(resolved[0].issues.some((i) => i.code === 'FOLDER_WILL_BE_CREATED' && i.severity === 'INFO')).toBe(true)
  })
})
