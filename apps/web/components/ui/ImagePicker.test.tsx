import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImagePicker } from '@/components/ui/ImagePicker'

const mockResponse = (data: unknown, ok = true) => ({ ok, json: async () => data } as Response)

describe('ImagePicker', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body as FormData | undefined
      if (url.includes('/api/admin/upload') && (init?.method ?? 'GET') === 'POST' && body?.get('file')) {
        return mockResponse({ url: '/api/upload/abc-123.png' })
      }
      return mockResponse({}, false)
    })
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('uploads a chosen file and reports the new url', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<ImagePicker value={null} onChange={onChange} />)

    const file = new File(['img'], 'photo.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('/api/upload/abc-123.png')
    })
    // The picker is controlled — the parent hands the url back.
    rerender(<ImagePicker value="/api/upload/abc-123.png" onChange={onChange} />)
    expect(screen.getByText('REPLACE IMAGE')).toBeTruthy()
  })

  it('uploads a pasted image (Ctrl+V) and reports the new url', async () => {
    const onChange = vi.fn()
    render(<ImagePicker value={null} onChange={onChange} />)

    const file = new File(['img'], 'pasted.png', { type: 'image/png' })
    const clipboardData = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
    }
    fireEvent.paste(screen.getByText('ADD IMAGE').closest('div') as HTMLElement, { clipboardData })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('/api/upload/abc-123.png')
    })
  })

  it('shows the current image with REMOVE and clears it', async () => {
    const onChange = vi.fn()
    render(<ImagePicker value="/api/upload/keep.png" onChange={onChange} />)

    expect(screen.getByText('REPLACE IMAGE')).toBeTruthy()
    fireEvent.click(screen.getByText('REMOVE'))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
