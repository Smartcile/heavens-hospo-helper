import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ListBox, ListRow } from '@/components/ui/ListBox'

describe('ListBox', () => {
  it('renders title and count', () => {
    const { getByText } = render(
      <ListBox title="INGREDIENTS" count={3}>
        <ListRow>ROW</ListRow>
      </ListBox>
    )
    expect(getByText('INGREDIENTS')).toBeTruthy()
    expect(getByText('(3)')).toBeTruthy()
  })

  it('renders an action node in the header', () => {
    const { getByText } = render(
      <ListBox title="ITEMS" action={<button>+ ADD</button>}>
        <ListRow>ROW</ListRow>
      </ListBox>
    )
    expect(getByText('+ ADD')).toBeTruthy()
  })

  it('renders children rows', () => {
    const { getByText } = render(
      <ListBox>
        <ListRow>ALPHA</ListRow>
        <ListRow>BETA</ListRow>
      </ListBox>
    )
    expect(getByText('ALPHA')).toBeTruthy()
    expect(getByText('BETA')).toBeTruthy()
  })
})

describe('ListRow', () => {
  it('fires onClick', () => {
    const onClick = vi.fn()
    const { getByText } = render(<ListRow onClick={onClick}>CLICK ME</ListRow>)
    fireEvent.click(getByText('CLICK ME'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applies active styling', () => {
    const { getByText } = render(<ListRow active>ACTIVE</ListRow>)
    expect(getByText('ACTIVE').className).toContain('bg-grey-mid/20')
  })
})
