import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Panel } from '@/components/ui/Panel'

describe('Panel', () => {
  it('renders children', () => {
    const { getByText } = render(<Panel>CONTENT</Panel>)
    expect(getByText('CONTENT')).toBeTruthy()
  })

  it('defaults to the solid variant with md padding', () => {
    const { container } = render(<Panel>X</Panel>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('panel')
    expect(el.className).toContain('p-3')
  })

  it('applies the outline variant', () => {
    const { container } = render(<Panel variant="outline">X</Panel>)
    expect((container.firstChild as HTMLElement).className).toContain('panel-outline')
  })

  it('maps the padding prop to a spacing class', () => {
    const { container } = render(<Panel padding="lg">X</Panel>)
    expect((container.firstChild as HTMLElement).className).toContain('p-4')
  })

  it('keeps extra className', () => {
    const { container } = render(<Panel className="space-y-2">X</Panel>)
    expect((container.firstChild as HTMLElement).className).toContain('space-y-2')
  })
})
