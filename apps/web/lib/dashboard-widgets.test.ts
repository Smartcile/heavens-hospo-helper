import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WIDGET_ORDER,
  DASHBOARD_WIDGETS,
  parseDashboardLayout,
  moveWidget,
  visibleWidgets,
} from './dashboard-widgets'

describe('parseDashboardLayout', () => {
  it('returns the default order for junk input', () => {
    expect(parseDashboardLayout(null)).toEqual({ order: DEFAULT_WIDGET_ORDER, hidden: [] })
    expect(parseDashboardLayout('nope')).toEqual({ order: DEFAULT_WIDGET_ORDER, hidden: [] })
  })

  it('keeps a valid stored order and appends widgets added later', () => {
    const stored = { order: ['MISSED', 'SUMMARY'], hidden: ['STOCK'] }
    const layout = parseDashboardLayout(stored)
    expect(layout.order[0]).toBe('MISSED')
    expect(layout.order[1]).toBe('SUMMARY')
    expect(layout.order).toHaveLength(DASHBOARD_WIDGETS.length)
    expect(layout.hidden).toEqual(['STOCK'])
  })

  it('drops unknown ids and dedupes', () => {
    const layout = parseDashboardLayout({ order: ['NOPE', 'SUMMARY', 'SUMMARY'], hidden: ['NOPE'] })
    expect(layout.order.filter((id) => id === 'SUMMARY')).toHaveLength(1)
    expect(layout.order).not.toContain('NOPE')
    expect(layout.hidden).toEqual([])
  })
})

describe('moveWidget', () => {
  it('moves an id to the requested index', () => {
    expect(moveWidget(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
    expect(moveWidget(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
  })

  it('clamps out-of-range indexes and ignores unknown ids', () => {
    expect(moveWidget(['a', 'b'], 'a', 99)).toEqual(['b', 'a'])
    expect(moveWidget(['a', 'b'], 'zz', 0)).toEqual(['a', 'b'])
  })
})

describe('visibleWidgets', () => {
  it('filters hidden widgets and follows the layout order', () => {
    const layout = parseDashboardLayout({ order: DEFAULT_WIDGET_ORDER, hidden: ['SUMMARY'] })
    const visible = visibleWidgets(layout)
    expect(visible.map((w) => w.id)).not.toContain('SUMMARY')
    expect(visible.map((w) => w.id)).toEqual(layout.order.filter((id) => id !== 'SUMMARY'))
  })
})
