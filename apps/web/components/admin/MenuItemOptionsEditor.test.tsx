import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MenuItemOptionsEditor } from '@/components/admin/MenuItemOptionsEditor'
import type { MenuOptionGroup } from '@/lib/menu-options'

vi.mock('@/components/ui/Toast', () => ({ pushToast: vi.fn() }))

const GROUPS: MenuOptionGroup[] = [
  {
    id: 'og1',
    name: 'SIDE',
    minSelect: 1,
    maxSelect: 1,
    choices: [
      { id: 'c1', name: 'FRIES', priceDelta: 0, isDefault: true },
      { id: 'c2', name: 'SALAD', priceDelta: 3, isDefault: false },
    ],
  },
]

type FetchMock = ReturnType<typeof vi.fn>

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    void url
    const json = (data: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
    if (init?.method === 'PUT') return json(GROUPS)
    return json(GROUPS)
  }) as unknown as typeof fetch
}

describe('MenuItemOptionsEditor', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('saves the normalised groups with ids, upcharges and defaults', async () => {
    const onSaved = vi.fn()
    render(
      <MenuItemOptionsEditor
        menuItemId="p1"
        menuItemName="FISH & CHIPS"
        initialOptions={GROUPS}
        onSaved={onSaved}
      />,
    )

    expect(screen.getByDisplayValue('SIDE')).toBeTruthy()
    expect(screen.getByDisplayValue('FRIES')).toBeTruthy()
    expect(screen.getByDisplayValue('SALAD')).toBeTruthy()

    fireEvent.click(screen.getByText('SAVE OPTIONS'))

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as FetchMock).mock.calls.find(
        ([u, i]) => String(u) === '/api/admin/menu-items/p1/options' && (i as RequestInit)?.method === 'PUT',
      )
      expect(call).toBeTruthy()
      const body = JSON.parse((call![1] as RequestInit).body as string)
      expect(body.groups[0]).toMatchObject({
        id: 'og1',
        name: 'SIDE',
        minSelect: 1,
        maxSelect: 1,
        choices: [
          { id: 'c1', name: 'FRIES', priceDelta: 0, isDefault: true },
          { id: 'c2', name: 'SALAD', priceDelta: 3, isDefault: false },
        ],
      })
    })
  })

  it('blocks a max select above the number of choices before saving', async () => {
    render(
      <MenuItemOptionsEditor menuItemId="p1" menuItemName="FISH & CHIPS" initialOptions={GROUPS} />,
    )

    fireEvent.change(screen.getAllByDisplayValue('1')[1], { target: { value: '3' } })
    fireEvent.click(screen.getByText('SAVE OPTIONS'))

    expect(screen.getByText(/MAX SELECT CANNOT EXCEED THE NUMBER OF CHOICES/)).toBeTruthy()
    const put = (globalThis.fetch as unknown as FetchMock).mock.calls.find(
      ([u, i]) => String(u) === '/api/admin/menu-items/p1/options' && (i as RequestInit)?.method === 'PUT',
    )
    expect(put).toBeFalsy()
  })

  it('adds a group and a choice', () => {
    render(
      <MenuItemOptionsEditor menuItemId="p1" menuItemName="FISH & CHIPS" initialOptions={[]} />,
    )
    fireEvent.click(screen.getByText('+ ADD GROUP'))
    expect(screen.getByPlaceholderText('SIDE / COOKING / EXTRA')).toBeTruthy()
    fireEvent.click(screen.getByText('+ ADD CHOICE'))
    expect(screen.getAllByPlaceholderText('CHOICE NAME').length).toBe(2)
  })
})
