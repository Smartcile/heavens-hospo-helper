import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MediaLibraryModal } from './MediaLibraryModal'

const FILES = [
  { name: 'fridge.png', url: '/api/upload/fridge.png', size: 1000, mtime: '2026-10-08T00:00:00Z' },
  { name: 'oven.png', url: '/api/upload/oven.png', size: 2000, mtime: '2026-10-07T00:00:00Z' },
]

describe('MediaLibraryModal', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('lists images, confirms large, goes back, and inserts', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ files: FILES }) } as Response)
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<MediaLibraryModal onClose={onClose} onPick={onPick} />)

    await waitFor(() => expect(screen.getByText('fridge.png')).toBeTruthy())
    expect(screen.getByText('oven.png')).toBeTruthy()

    // Select → large confirm view.
    fireEvent.click(screen.getByText('fridge.png'))
    const large = screen.getAllByAltText('fridge.png')
    expect(large.some((el) => el.className.includes('max-h-[55vh]'))).toBe(true)

    // Back to the grid.
    fireEvent.click(screen.getByText('← BACK'))
    expect(screen.getByText('oven.png')).toBeTruthy()

    // Select again and insert.
    fireEvent.click(screen.getByText('oven.png'))
    fireEvent.click(screen.getByText('INSERT IMAGE'))
    expect(onPick).toHaveBeenCalledWith('/api/upload/oven.png')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the API error for a non-admin', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ error: 'ADMIN ONLY' }) } as Response)
    render(<MediaLibraryModal onClose={() => {}} onPick={() => {}} />)
    await waitFor(() => expect(screen.getByText('ADMIN ONLY')).toBeTruthy())
  })
})
