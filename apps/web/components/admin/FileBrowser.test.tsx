import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FileBrowser } from '@/components/admin/FileBrowser'

const mockResponse = (data: unknown, ok = true) => ({ ok, json: async () => data } as Response)

function mockFetch(handlers: Record<string, unknown>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const key = Object.keys(handlers).find((k) => url.includes(k))
    return mockResponse(handlers[key ?? ''] ?? {})
  })
}

const png = { name: 'photo.png', dir: false, size: 2048, mtime: '2026-09-07T00:00:00Z' }
const pdf = { name: 'Gift Card - 20260001.pdf', dir: false, size: 4096, mtime: '2026-09-08T00:00:00Z' }

describe('FileBrowser', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('lists the media root, shows usage chips and expands folders', async () => {
    mockFetch({
      // Most-specific keys first: folder/usage queries must beat the root prefix.
      'root=media&path=gift-cards': { entries: [pdf] },
      'root=media&path=': {
        entries: [
          { name: 'gift-cards', dir: true, size: 0, mtime: '2026-09-08T00:00:00Z' },
          png,
        ],
      },
      '/files/usage': { usagesByFile: { 'photo.png': [{ kind: 'menu', label: 'MENU PRODUCT PHOTO', ref: 'BURGER', id: 'm1' }] } },
    })

    render(<FileBrowser />)

    expect(await screen.findByText('photo.png')).toBeTruthy()
    expect(screen.getByText('2 KB')).toBeTruthy()
    // Usage tag from the batch lookup: photo.png is used on a menu product.
    expect(await screen.findByText('MENU')).toBeTruthy()

    fireEvent.click(screen.getByText('gift-cards'))
    expect(await screen.findByText('Gift Card - 20260001.pdf')).toBeTruthy()
  })

  it('opens a preview popup on file click — linked files cannot be deleted', async () => {
    const del = vi.fn()
    mockFetch({
      // Specific queries first — the root prefix would swallow them.
      'root=media&path=photo.png': {
        usages: [{ kind: 'menu', label: 'MENU PRODUCT PHOTO', ref: 'BURGER', id: 'm1' }],
      },
      '/files/usage?root=media&dir=': { usagesByFile: { 'photo.png': [{ kind: 'menu', label: 'MENU PRODUCT PHOTO', ref: 'BURGER', id: 'm1' }] } },
      'root=media&path=': { entries: [png] },
      'DELETE': () => del(),
    })

    render(<FileBrowser />)
    await screen.findByText('photo.png')
    fireEvent.click(screen.getByText('photo.png'))

    // Popup shows usage tags…
    expect(await screen.findByText("WHERE IT'S USED")).toBeTruthy()
    expect(screen.getByText('MENU PRODUCT PHOTO')).toBeTruthy()
    expect(screen.getByText('BURGER')).toBeTruthy()
    // …and the DELETE button is disabled because the file is linked.
    const deleteBtn = screen.getByRole('button', { name: 'DELETE' }) as HTMLButtonElement
    expect(deleteBtn.disabled).toBe(true)

    fireEvent.click(screen.getByText('CLOSE'))
    await waitFor(() => expect(screen.queryByText("WHERE IT'S USED")).toBeNull())
    expect(del).not.toHaveBeenCalled()
  })

  it('deletes an unlinked file from the popup after confirmation', async () => {
    const del = vi.fn()
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'DELETE') { del(url, init); return mockResponse({ ok: true }) }
      if (url.includes('/files/usage')) return mockResponse({ usages: [], usagesByFile: {} })
      if (url.includes('/files/download')) {
        return { ok: true, blob: async () => new Blob(['png']) } as Response
      }
      if (url.includes('root=media&path=')) return mockResponse({ entries: [png] })
      return mockResponse({ entries: [] })
    })

    render(<FileBrowser />)
    await screen.findByText('photo.png')
    fireEvent.click(screen.getByText('photo.png'))
    await screen.findByText('NOT LINKED ANYWHERE — FREE TO DELETE')

    fireEvent.click(screen.getByRole('button', { name: 'DELETE' }))

    await waitFor(() => {
      expect(del).toHaveBeenCalledTimes(1)
      expect(String(del.mock.calls[0][0])).toContain('root=media')
      expect(String(del.mock.calls[0][0])).toContain('path=photo.png')
    })
    // Popup closes and the row disappears without a refetch.
    await waitFor(() => {
      expect(screen.queryByText('photo.png')).toBeNull()
    })
  })

  it('shows the backups empty-state hint', async () => {
    mockFetch({ 'root=media&path=': { entries: [] }, 'root=backups&path=': { entries: [] } })

    render(<FileBrowser />)
    expect(await screen.findByText('EMPTY')).toBeTruthy()

    fireEvent.click(screen.getByText('BACKUPS'))
    expect(await screen.findByText(/NO STORED ARCHIVES/)).toBeTruthy()
  })
})
