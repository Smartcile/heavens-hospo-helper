import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MenuItemDetailsModal } from '@/components/admin/MenuItemDetailsModal'

let links: Record<string, unknown>[] = []
let loadOk = true
let linkStatus = 200

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    const u = String(url)
    const json = (d: unknown, status = 200) =>
      Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(d) })
    if (u.startsWith('/api/admin/swiftpos/menu-links') && init?.method === 'PUT') {
      links.push(JSON.parse(String(init.body)))
      return json(
        linkStatus < 400 ? { ok: true } : { error: 'CODE ALREADY LINKED TO ANOTHER PRODUCT' },
        linkStatus,
      )
    }
    if (u === '/api/admin/menu-items/m1' && init?.method === 'PUT') return json({ ok: true })
    if (u === '/api/admin/menu-items/m1') {
      if (!loadOk) return json({ error: 'NOT FOUND' }, 404)
      return json({ tastingNotes: '', vintage: '', howToServe: '', swiftPosId: 'TAP ASAHI' })
    }
    if (u.startsWith('/api/admin/menu-items/m1/equipment')) return json([])
    if (u.startsWith('/api/admin/inventory')) return json([])
    return json(null)
  }) as unknown as typeof fetch
}

function renderModal() {
  return render(
    <MenuItemDetailsModal menuItemId="m1" menuItemName="ASAHI TAP" onClose={() => {}} />,
  )
}

describe('MenuItemDetailsModal', () => {
  beforeEach(() => {
    links = []
    loadOk = true
    linkStatus = 200
    globalThis.fetch = mockFetch()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('saves the SwiftPOS code through the menu-links route when it changes', async () => {
    renderModal()

    await waitFor(() => expect(screen.getByDisplayValue('TAP ASAHI')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('SWIFT POS CODE'), { target: { value: 'tap asahi 2' } })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(links).toHaveLength(1))
    expect(links[0]).toEqual({ menuItemId: 'm1', swiftPosId: 'TAP ASAHI 2' })
  })

  it('does not touch the SwiftPOS link when only other details change', async () => {
    renderModal()

    await waitFor(() => expect(screen.getByDisplayValue('TAP ASAHI')).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText('CRISP, CITRUS, MINERAL FINISH…'), {
      target: { value: 'Crisp' },
    })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(screen.getByText('SAVED')).toBeTruthy())
    expect(links).toHaveLength(0)
  })

  it('never writes the SwiftPOS code when the initial load failed', async () => {
    loadOk = false
    renderModal()

    await waitFor(() => expect(screen.getByText('COULD NOT LOAD PRODUCT DETAILS')).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText('CRISP, CITRUS, MINERAL FINISH…'), {
      target: { value: 'Crisp' },
    })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(screen.getByText('SAVED')).toBeTruthy())
    expect(links).toHaveLength(0)
  })

  it('surfaces a link error without implying the detail save failed', async () => {
    linkStatus = 409
    renderModal()

    await waitFor(() => expect(screen.getByDisplayValue('TAP ASAHI')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('SWIFT POS CODE'), { target: { value: 'OTHER' } })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(screen.getByText(/DETAILS SAVED/)).toBeTruthy())
    expect(screen.getByText(/CODE ALREADY LINKED/)).toBeTruthy()
    expect(screen.queryByText('SAVE FAILED')).toBeNull()
  })
})
