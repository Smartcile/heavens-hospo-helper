import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

import { KioskUnlock } from './KioskUnlock'

beforeEach(() => {
  fetchMock.mockReset()
  refresh.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KioskUnlock', () => {
  it('refreshes after the right code', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    render(<KioskUnlock />)

    fireEvent.change(screen.getByPlaceholderText('KIOSK CODE'), {
      target: { value: 'abc123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'UNLOCK KIOSK' }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.code).toBe('ABC123')
  })

  it('shows the error from the server', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'WRONG KIOSK CODE' }, 401))
    render(<KioskUnlock />)

    fireEvent.change(screen.getByPlaceholderText('KIOSK CODE'), {
      target: { value: 'WRONG9' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'UNLOCK KIOSK' }))

    expect(await screen.findByText('WRONG KIOSK CODE')).toBeInTheDocument()
  })

  it('shows a note when the venue changed the code', () => {
    render(<KioskUnlock message="KIOSK CODE HAS CHANGED" />)
    expect(screen.getByText('KIOSK CODE HAS CHANGED')).toBeInTheDocument()
  })
})
