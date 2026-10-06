import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MenuBuilder } from '@/components/admin/MenuBuilder'
import type { MenuShape } from '@/lib/menu-lines'

const MENU: MenuShape = {
  id: 'm1',
  name: 'BEVERAGE',
  description: null,
  minPax: null,
  maxPax: null,
  isActive: true,
  wooCategoryId: null,
  groups: [{ id: 'g1', name: 'TAP BEER', sortOrder: 0 }],
  items: [
    {
      id: 'l1',
      kind: 'PRODUCT',
      groupId: 'g1',
      menuItemId: 'p1',
      inventoryItemId: null,
      name: 'ASAHI 5%',
      price: 16.5,
      dietaryInfo: null,
      isActive: true,
      imageUrl: null,
      unit: null,
      minQty: null,
      maxQty: null,
      sortOrder: 0,
      sizes: [
        { label: '400ML', price: 16.5 },
        { label: '1.4L', price: 56 },
      ],
    },
  ],
}

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT' || init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'm1' }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  }) as unknown as typeof fetch
}

function renderBuilder(menu: MenuShape | null = null) {
  return render(
    <MenuBuilder
      menu={menu}
      venueId="v1"
      products={[]}
      inventory={[{ id: 's1', name: 'COKE', unit: 'EA', category: { name: 'SOFT DRINK', tab: 'BEVERAGE' } }]}
      wooCategories={[]}
      onClose={() => {}}
      onSaved={() => {}}
      onOpenServes={() => {}}
    />,
  )
}

describe('MenuBuilder', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the menu lines and a live preview with groups + sizes', () => {
    renderBuilder(MENU)
    expect(screen.getAllByText('TAP BEER').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ASAHI 5%').length).toBeGreaterThan(0)
    expect(screen.getByText('400ML')).toBeTruthy()
    expect(screen.getByText('1.4L')).toBeTruthy()
  })

  it('adds a group', () => {
    renderBuilder(MENU)
    fireEvent.click(screen.getByText('+ ADD GROUP'))
    expect(screen.getAllByPlaceholderText('GROUP NAME').length).toBe(2)
  })

  it('saves a stock item line via the menu PUT', async () => {
    renderBuilder(MENU)

    fireEvent.change(screen.getByPlaceholderText('SEARCH PRODUCTS OR STOCK ITEMS...'), { target: { value: 'COKE' } })
    fireEvent.click(screen.getByText('COKE'))
    fireEvent.click(screen.getByText('SAVE MENU'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      const put = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === 'PUT' && String(c[0]).includes('/api/admin/menus/m1'))
      expect(put).toBeTruthy()
      const body = JSON.parse((put![1] as { body: string }).body)
      expect(body.items.some((i: { inventoryItemId?: string }) => i.inventoryItemId === 's1')).toBe(true)
      expect(body.groups[0]).toMatchObject({ id: 'g1', name: 'TAP BEER' })
    })
  })
})
