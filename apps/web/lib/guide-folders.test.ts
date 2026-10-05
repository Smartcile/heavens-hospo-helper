import { describe, it, expect } from 'vitest'
import { sortFolders, nextFolderSortOrder, groupGuidesByFolder } from './guide-folders'

const folders = [
  { id: 'b', name: 'BEER', sortOrder: 2 },
  { id: 'a', name: 'WINE', sortOrder: 1 },
]

describe('sortFolders', () => {
  it('orders by sortOrder then name', () => {
    expect(sortFolders(folders).map((f) => f.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the input', () => {
    const input = [...folders]
    sortFolders(input)
    expect(input.map((f) => f.id)).toEqual(['b', 'a'])
  })
})

describe('nextFolderSortOrder', () => {
  it('is one past the highest', () => {
    expect(nextFolderSortOrder(folders)).toBe(3)
  })

  it('starts at 0 for no folders', () => {
    expect(nextFolderSortOrder([])).toBe(0)
  })
})

describe('groupGuidesByFolder', () => {
  const guides = [
    { id: 'g1', folderId: 'a' },
    { id: 'g2', folderId: 'b' },
    { id: 'g3', folderId: 'a' },
    { id: 'g4', folderId: null },
  ]

  it('groups guides in folder order and preserves guide order', () => {
    const groups = groupGuidesByFolder(guides, folders)
    expect(groups.map((g) => g.folder?.id ?? null)).toEqual(['a', 'b', null])
    expect(groups[0].guides.map((g) => g.id)).toEqual(['g1', 'g3'])
    expect(groups[1].guides.map((g) => g.id)).toEqual(['g2'])
    expect(groups[2].guides.map((g) => g.id)).toEqual(['g4'])
  })

  it('includes empty folders but omits an empty UNFILED bucket', () => {
    const groups = groupGuidesByFolder([{ id: 'g1', folderId: 'a' }], folders)
    expect(groups.find((g) => g.folder?.id === 'b')?.guides).toEqual([])
    expect(groups.some((g) => g.folder === null)).toBe(false)
  })

  it('treats a missing folder as unfiled', () => {
    const groups = groupGuidesByFolder([{ id: 'g1', folderId: 'gone' }], folders)
    expect(groups[groups.length - 1].folder).toBeNull()
    expect(groups[groups.length - 1].guides).toHaveLength(1)
  })
})
