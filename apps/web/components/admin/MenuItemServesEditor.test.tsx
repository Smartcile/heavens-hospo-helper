import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MenuItemServesEditor } from '@/components/admin/MenuItemServesEditor'

vi.mock('@/components/ui/Toast', () => ({ pushToast: vi.fn() }))

type FetchMock = ReturnType<typeof vi.fn>

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    const json = (data: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
    const u = String(url)
    if (u === '/api/admin/menu-items/m1/serves') {
      if (init?.method === 'PUT') return json([])
      return json([
        { label: '30ML', method: 'POURED', qty: 30, uomId: 'u1', recipeId: null, inventoryItemId: 'i1' },
      ])
    }
    if (u.startsWith('/api/admin/recipes')) return json([{ id: 'r1', name: 'MARGARITA BUILD' }])
    if (u.startsWith('/api/admin/inventory')) return json([{ id: 'i1', name: 'SEA LOVERS GIN' }])
    if (u.startsWith('/api/admin/uoms')) return json([{ id: 'u1', name: 'ML', kind: 'VOLUME' }])
    return json(null)
  }) as unknown as typeof fetch
}

describe('MenuItemServesEditor', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('loads a product\u2019s serves and saves qty edits', async () => {
    render(<MenuItemServesEditor menuItemId="m1" menuItemName="SEA LOVERS GIN" venueId="v1" />)

    // The loaded serve renders its label + qty.
    await waitFor(() => expect(screen.getByDisplayValue('30ML')).toBeTruthy())

    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '45' } })
    fireEvent.click(screen.getByText('SAVE SERVES'))

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as FetchMock).mock.calls.find(
        ([u, i]) => String(u) === '/api/admin/menu-items/m1/serves' && (i as RequestInit)?.method === 'PUT',
      )
      expect(call).toBeTruthy()
      const body = JSON.parse((call![1] as RequestInit).body as string)
      expect(body.serves).toEqual([
        { label: '30ML', method: 'POURED', recipeId: null, inventoryItemId: 'i1', qty: 45, uomId: 'u1' },
      ])
    })
  })
})
