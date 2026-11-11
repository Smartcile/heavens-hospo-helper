import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HelpClient } from '@/components/admin/HelpClient'

const articles = [
  { id: '1', slug: 'getting-started', title: 'GETTING STARTED', summary: 'LOG IN FIRST', category: 'START HERE', audience: 'EVERYONE', sortOrder: 10, bodyHtml: '<h2>Welcome</h2><p>Use the sidebar.</p>' },
  { id: '2', slug: 'tasks', title: 'TASKS', summary: 'DAILY LISTS', category: 'TEAM', audience: 'EVERYONE', sortOrder: 20, bodyHtml: '<p>Tick off your work.</p>' },
  { id: '3', slug: 'inventory', title: 'INVENTORY', summary: 'STOCK LEVELS', category: 'OPS', audience: 'EVERYONE', sortOrder: 30, bodyHtml: '<h2>Deleting an item safely</h2><p>If the item is still in use, the app stops the delete.</p><img src="/help/inventory-delete-blocked.png" alt="Delete blocked popup listing where the item is used">' },
]

function mockFetch() {
  return vi.spyOn(global, 'fetch').mockImplementation(async () =>
    ({ ok: true, json: async () => articles }) as Response,
  )
}

describe('HelpClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('lists and searches articles, then opens one', async () => {
    mockFetch()
    render(<HelpClient endpoint="/api/admin/help" />)

    expect(await screen.findByText('GETTING STARTED')).toBeDefined()
    expect(screen.getByText('TASKS')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Search help'), { target: { value: 'tick' } })
    expect(screen.getByText('TASKS')).toBeDefined()
    expect(screen.queryByText('GETTING STARTED')).toBeNull()

    fireEvent.click(screen.getByText('TASKS'))
    expect(await screen.findByText(/Tick off your work/)).toBeDefined()

    fireEvent.click(screen.getByText('✕ CLOSE'))
    expect(screen.getByText('HEAVENLY HELP', { exact: false })).toBeDefined()
  })

  it('shows an empty state when the catalogue is empty', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => [] } as Response)
    render(<HelpClient endpoint="/api/worker/help" />)
    await waitFor(() => expect(screen.getByText('NO HELP ARTICLES YET.')).toBeDefined())
  })

  it('opens a screenshot in a full-screen lightbox and closes it with Escape', async () => {
    mockFetch()
    render(<HelpClient endpoint="/api/admin/help" />)

    fireEvent.click(await screen.findByText('INVENTORY'))
    const image = await screen.findByAltText('Delete blocked popup listing where the item is used')
    fireEvent.click(image)

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('Delete blocked popup listing where the item is used')
    expect(screen.getByRole('button', { name: 'Close image' })).toBeDefined()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes the screenshot lightbox when the backdrop is clicked', async () => {
    mockFetch()
    render(<HelpClient endpoint="/api/admin/help" />)

    fireEvent.click(await screen.findByText('INVENTORY'))
    fireEvent.click(await screen.findByAltText('Delete blocked popup listing where the item is used'))
    expect(screen.getByRole('dialog')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Close image' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
