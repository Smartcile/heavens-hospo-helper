import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EventBuilder, type EventDetail } from '@/components/admin/EventBuilder'

const EVENT: EventDetail = {
  id: 'e1',
  name: 'SMITH WEDDING',
  eventType: 'WEDDING',
  status: 'CONFIRMED',
  eventDate: '2026-11-14T00:00:00.000Z',
  startTime: '16:00',
  endTime: '23:00',
  guestCount: 96,
  diningStyle: 'PLATED',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  menuId: null,
  serviceId: null,
  setupId: null,
  pushToBookings: false,
  depositAmount: 2500,
  paymentStatus: 'PARTIAL',
  notes: null,
  internalNotes: null,
  blocks: [{ id: 'b1', type: 'NOTES', title: null, config: { text: 'HELLO' }, sortOrder: 0 }],
}

const REFS = { menus: [], menuItems: [], services: [], setups: [] }

function renderBuilder() {
  return render(
    <EventBuilder event={EVENT} venueId="v1" refs={REFS} onBack={() => {}} onSaved={() => {}} />,
  )
}

describe('EventBuilder', () => {
  beforeEach(() => {
    // The builder saves the event, then its blocks, then re-reads the event to
    // pick up real block ids — so the mock answers all three.
    globalThis.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(String(url).endsWith('/blocks') ? { saved: [], deleted: 0 } : EVENT),
      }),
    ) as unknown as typeof fetch
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the event name, date and its blocks', () => {
    renderBuilder()
    expect(screen.getByText('SMITH WEDDING')).toBeTruthy()
    expect(screen.getByText('2026-11-14')).toBeTruthy()
    expect(screen.getByText(/1 BLOCK\(S\)/)).toBeTruthy()
    // The NOTES block is on the canvas and also in the library.
    expect(screen.getAllByText(/NOTES/).length).toBeGreaterThan(0)
  })

  it('adds a block when a library tile is clicked', () => {
    renderBuilder()
    fireEvent.click(screen.getByText('MENU SELECTION'))
    expect(screen.getByText(/2 BLOCK\(S\)/)).toBeTruthy()
  })

  it('removes a block', () => {
    renderBuilder()
    fireEvent.click(screen.getByLabelText('Delete block'))
    expect(screen.getByText(/0 BLOCK\(S\)/)).toBeTruthy()
  })

  it('reorders a block with the down control', () => {
    renderBuilder()
    fireEvent.click(screen.getByText('MENU SELECTION'))
    // Blocks are [NOTES, MENU SELECTION]; move NOTES down.
    fireEvent.click(screen.getAllByLabelText('Move down')[0])
    const cards = screen.getAllByRole('button').map((b) => b.textContent ?? '')
    const notesIdx = cards.findIndex((t) => t.includes('NOTES') && !t.includes('MENU'))
    const menuIdx = cards.findIndex((t) => t.includes('MENU SELECTION'))
    expect(menuIdx).toBeGreaterThan(-1)
    expect(notesIdx).toBeGreaterThan(menuIdx)
  })

  it('saves the event then its blocks', async () => {
    renderBuilder()
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      expect(calls.length).toBeGreaterThanOrEqual(2)
      expect(calls[0][0]).toBe('/api/admin/events/e1')
      expect((calls[0][1] as { method: string }).method).toBe('PUT')
      expect(calls[1][0]).toBe('/api/admin/events/e1/blocks')
      expect((calls[1][1] as { method: string }).method).toBe('PUT')
    })
  })
})
