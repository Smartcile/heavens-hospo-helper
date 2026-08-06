import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuideStepLinks } from '@/components/GuideStepLinks'
import type { ResolvedStepLink } from '@/lib/guide-links'

function link(over: Partial<ResolvedStepLink> = {}): ResolvedStepLink {
  return {
    id: 'l1',
    kind: 'ITEM',
    targetId: 't1',
    qty: null,
    note: null,
    order: 0,
    target: { id: 't1', label: 'T20 TORX', sub: null, imageUrl: null, missing: false },
    ...over,
  }
}

describe('GuideStepLinks', () => {
  it('renders nothing when there are no links', () => {
    const { container } = render(<GuideStepLinks links={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the target label and kind', () => {
    render(<GuideStepLinks links={[link()]} />)
    expect(screen.getByText('T20 TORX')).toBeTruthy()
    expect(screen.getByText('TOOL / ITEM')).toBeTruthy()
  })

  it('shows a quantity prefix only above 1', () => {
    const { rerender } = render(<GuideStepLinks links={[link({ qty: 2 })]} />)
    expect(screen.getByText('2×')).toBeTruthy()
    rerender(<GuideStepLinks links={[link({ qty: 1 })]} />)
    expect(screen.queryByText('1×')).toBeNull()
  })

  // A polymorphic targetId has no FK, so a purged item must render as removed
  // rather than blowing up the reader.
  it('renders a missing target without throwing', () => {
    render(
      <GuideStepLinks
        links={[link({ target: { id: 'gone', label: 'ITEM REMOVED', sub: null, imageUrl: null, missing: true } })]}
      />,
    )
    expect(screen.getByText('ITEM REMOVED')).toBeTruthy()
  })

  it('prefers the operator note over the resolved sub-line', () => {
    render(
      <GuideStepLinks
        links={[link({
          note: 'TOP SHELF',
          target: { id: 't1', label: 'T20 TORX', sub: 'BAR → STORE', imageUrl: null, missing: false },
        })]}
      />,
    )
    expect(screen.getByText('TOP SHELF')).toBeTruthy()
    expect(screen.queryByText('BAR → STORE')).toBeNull()
  })

  it('falls back to the resolved sub-line when there is no note', () => {
    render(
      <GuideStepLinks
        links={[link({
          target: { id: 't1', label: 'T20 TORX', sub: 'BAR → STORE', imageUrl: null, missing: false },
        })]}
      />,
    )
    expect(screen.getByText('BAR → STORE')).toBeTruthy()
  })

  it('renders a thumbnail when the target has an image', () => {
    const { container } = render(
      <GuideStepLinks
        links={[link({
          target: { id: 't1', label: 'T20 TORX', sub: null, imageUrl: '/uploads/a.png', missing: false },
        })]}
      />,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/uploads/a.png')
  })

  it('renders every kind label', () => {
    render(
      <GuideStepLinks
        links={[
          link({ id: 'a', kind: 'TASK' }),
          link({ id: 'b', kind: 'CHECKLIST' }),
          link({ id: 'c', kind: 'RECIPE' }),
        ]}
      />,
    )
    expect(screen.getByText('TASK')).toBeTruthy()
    expect(screen.getByText('CHECKLIST')).toBeTruthy()
    expect(screen.getByText('RECIPE')).toBeTruthy()
  })
})
