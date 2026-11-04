import { describe, it, expect } from 'vitest'
import {
  groupHelpArticles,
  helpContentHash,
  helpVisibleTo,
  searchHelpArticles,
  visibleHelpArticles,
  HELP_REQUIRED_SLUGS,
} from '@/lib/help'
import { HELP_ARTICLES } from '../content/help/articles'

const sample = [
  { slug: 'a', title: 'ALPHA', summary: 'first', category: 'START', audience: 'EVERYONE' as const, sortOrder: 10, bodyHtml: '<p>HELLO</p>' },
  { slug: 'b', title: 'BETA', summary: null, category: 'ADMIN', audience: 'ADMIN' as const, sortOrder: 20, bodyHtml: '<p>SECRET</p>' },
  { slug: 'c', title: 'GAMMA', summary: null, category: 'WORK', audience: 'WORKER' as const, sortOrder: 30, bodyHtml: '<p>TASKS</p>' },
]

describe('help visibility', () => {
  it('shows EVERYONE to both viewers and scopes ADMIN/WORKER', () => {
    expect(helpVisibleTo('EVERYONE', 'ADMIN')).toBe(true)
    expect(helpVisibleTo('EVERYONE', 'WORKER')).toBe(true)
    expect(helpVisibleTo('ADMIN', 'ADMIN')).toBe(true)
    expect(helpVisibleTo('ADMIN', 'WORKER')).toBe(false)
    expect(helpVisibleTo('WORKER', 'WORKER')).toBe(true)
    expect(helpVisibleTo('WORKER', 'ADMIN')).toBe(false)
  })

  it('filters and sorts by sortOrder', () => {
    expect(visibleHelpArticles(sample, 'ADMIN').map((a) => a.slug)).toEqual(['a', 'b'])
    expect(visibleHelpArticles(sample, 'WORKER').map((a) => a.slug)).toEqual(['a', 'c'])
  })
})

describe('grouping and search', () => {
  it('groups by category in category sort order', () => {
    expect(groupHelpArticles(sample).map((g) => g.category)).toEqual(['START', 'ADMIN', 'WORK'])
  })

  it('searches title, summary and body text', () => {
    expect(searchHelpArticles(sample, 'hello').map((a) => a.slug)).toEqual(['a'])
    expect(searchHelpArticles(sample, 'first').map((a) => a.slug)).toEqual(['a'])
    expect(searchHelpArticles(sample, 'TASKS').map((a) => a.slug)).toEqual(['c'])
    expect(searchHelpArticles(sample, '   ')).toHaveLength(3)
  })
})

describe('content hash', () => {
  it('is stable and changes with content', () => {
    const base = { ...sample[0] }
    const hash = helpContentHash(base)
    expect(helpContentHash({ ...base })).toBe(hash)
    expect(helpContentHash({ ...base, bodyHtml: '<p>CHANGED</p>' })).not.toBe(hash)
  })
})

describe('content pack', () => {
  it('contains every required feature article with unique slugs', () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of HELP_REQUIRED_SLUGS) expect(slugs).toContain(slug)
  })

  it('has a title, category and body for every article', () => {
    for (const article of HELP_ARTICLES) {
      expect(article.title.trim().length).toBeGreaterThan(0)
      expect(article.category.trim().length).toBeGreaterThan(0)
      expect(article.bodyHtml.length).toBeGreaterThan(20)
    }
  })
})
