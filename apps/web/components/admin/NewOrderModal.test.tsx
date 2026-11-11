import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewOrderModal } from './NewOrderModal'

const SIDE_GROUP = {
  id: 'g-side',
  name: 'SIDE',
  minSelect: 1,
  maxSelect: 1,
  sortOrder: 0,
  choices: [
    { id: 'c-fries', name: 'FRIES', priceDelta: 0, isDefault: true, sortOrder: 0 },
    { id: 'c-salad', name: 'SALAD', priceDelta: 3, isDefault: false, sortOrder: 1 },
  ],
}

const PRODUCT = {
  id: 'm1',
  name: 'FISH & CHIPS',
  price: 18,
  dietaryInfo: null,
  optionGroups: [SIDE_GROUP],
}

const SHAPED_LINE = {
  menuItemId: 'm1',
  name: 'FISH & CHIPS',
  price: 18,
  dietaryInfo: null,
  minQty: null,
  maxQty: null,
  options: [SIDE_GROUP],
}

const MENU = {
  id: 'menu1',
  name: 'DINNER',
  minPax: null,
  maxPax: null,
  isActive: true,
  items: [SHAPED_LINE],
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response
}

function inputByLabel(label: string): HTMLInputElement {
  const el = screen.getByText(label).parentElement?.querySelector('input')
  if (!el) throw new Error(`Input not found for label ${label}`)
  return el as HTMLInputElement
}

let fetchMock: ReturnType<typeof vi.fn>

function mockFetch(menus: unknown[], items: unknown[]) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/admin/menus')) return jsonResponse(menus)
    if (url.startsWith('/api/admin/menu-items')) return jsonResponse(items)
    if (url === '/api/admin/orders' && init?.method === 'POST') return jsonResponse({ id: 'o1' })
    return { ok: false, json: async () => ({}) } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
}

async function addItemFromSearch(name: string) {
  const search = screen.getByPlaceholderText('SEARCH...')
  fireEvent.change(search, { target: { value: name } })
  await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
}

describe('NewOrderModal options', () => {
  beforeEach(() => {
    mockFetch([], [PRODUCT])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('preselects the default choice when a product is added', async () => {
    render(<NewOrderModal date="2026-11-12" onClose={() => {}} onCreated={() => {}} />)
    await waitFor(() => expect(screen.getByPlaceholderText('SEARCH...')).toBeTruthy())

    await addItemFromSearch('FISH & CHIPS')

    expect(screen.getByRole('button', { name: /FRIES/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /SALAD/ }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('$18.00')).toBeTruthy()
  })

  it('shows the total including the option upcharge', async () => {
    render(<NewOrderModal date="2026-11-12" onClose={() => {}} onCreated={() => {}} />)
    await waitFor(() => expect(screen.getByPlaceholderText('SEARCH...')).toBeTruthy())

    await addItemFromSearch('FISH & CHIPS')
    fireEvent.click(screen.getByRole('button', { name: /SALAD/ }))

    // Displayed total is base 18 + SALAD +3.
    expect(screen.getByText('$21.00')).toBeTruthy()
  })

  it('POSTs the BASE unitPrice with the option snapshot, not the displayed total', async () => {
    const onCreated = vi.fn()
    const onClose = vi.fn()
    render(<NewOrderModal date="2026-11-12" onClose={onClose} onCreated={onCreated} />)
    await waitFor(() => expect(screen.getByPlaceholderText('SEARCH...')).toBeTruthy())

    await addItemFromSearch('FISH & CHIPS')
    fireEvent.click(screen.getByRole('button', { name: /SALAD/ }))
    fireEvent.change(inputByLabel('CUSTOMER NAME'), { target: { value: 'JANE' } })

    fireEvent.click(screen.getByRole('button', { name: 'CREATE ORDER' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())

    const post = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/admin/orders' && (init as RequestInit | undefined)?.method === 'POST',
    )
    const body = JSON.parse(String((post?.[1] as RequestInit).body))

    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      menuItemId: 'm1',
      qty: 1,
      unitPrice: 18, // base — the displayed total is 21
      options: [
        { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c-salad', choiceName: 'SALAD', priceDelta: 3 },
      ],
    })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('NewOrderModal menu-selected lines', () => {
  beforeEach(() => {
    mockFetch([MENU], [PRODUCT])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('derives the product from a shaped menu line and shows its option picker', async () => {
    render(<NewOrderModal date="2026-11-12" onClose={() => {}} onCreated={() => {}} />)
    await waitFor(() => expect(screen.getByPlaceholderText('SEARCH...')).toBeTruthy())

    // Choose the menu — the API returns shaped lines (no nested `menuItem`).
    const menuSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(menuSelect, { target: { value: 'menu1' } })

    await addItemFromSearch('FISH & CHIPS')

    // The option picker works off the shaped line's `options` and its default.
    expect(screen.getByRole('button', { name: /FRIES/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /SALAD/ }))
    expect(screen.getByText('$21.00')).toBeTruthy()
  })
})
