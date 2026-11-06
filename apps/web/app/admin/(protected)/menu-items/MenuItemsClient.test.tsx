import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MenuItemsClient } from './MenuItemsClient'

const ITEM = {
  id: 'm1',
  name: 'FISH & CHIPS',
  recipeId: null,
  price: 18,
  imageUrl: null,
  shortDescription: null,
  description: null,
  isActive: true,
  dietaryInfo: null,
  recipe: null,
}

function json(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

describe('MenuItemsClient', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/admin/menu-items' && init?.method === 'PUT') return json({ ...ITEM })
      if (url === '/api/admin/menu-items') return json([ITEM])
      if (url.startsWith('/api/admin/recipes')) return json([{ id: 'r1', name: 'BATTER' }])
      return json([])
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists a recipe-less product and saves it with recipeId: null', async () => {
    const fetchMock = vi.mocked(global.fetch)
    render(<MenuItemsClient />)

    await waitFor(() => expect(screen.getByText('FISH & CHIPS')).toBeTruthy())
    expect(screen.getByText(/NO RECIPE/)).toBeTruthy()

    fireEvent.click(screen.getByText('FISH & CHIPS'))
    await waitFor(() => expect(screen.getByDisplayValue('FISH & CHIPS')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/menu-items/m1' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.recipeId).toBeNull()
      expect(body.name).toBe('FISH & CHIPS')
    })
  })
})
