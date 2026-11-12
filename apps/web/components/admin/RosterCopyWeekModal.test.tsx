import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

import { RosterCopyWeekModal } from '@/components/admin/RosterCopyWeekModal'

interface FetchCall { url: string; init?: RequestInit }

function mockFetch(handler: (call: FetchCall) => unknown) {
  const spy = vi.spyOn(global, 'fetch')
  spy.mockImplementation(async (input, init) => {
    const call = { url: String(input), init: init ?? undefined }
    return { ok: true, json: async () => handler(call) } as Response
  })
  return spy
}

afterEach(() => vi.restoreAllMocks())

function renderModal(onDone = vi.fn()) {
  return render(
    <RosterCopyWeekModal venueId="v1" sourceStart="2026-11-09" onClose={vi.fn()} onDone={onDone} />,
  )
}

describe('RosterCopyWeekModal', () => {
  it('copies to the next week in ADD mode without a confirmation', async () => {
    const spy = mockFetch(() => ({ created: 4, replaced: 0, skippedStaffIds: [] }))
    const onDone = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderModal(onDone)

    expect(screen.getByDisplayValue('2026-11-16')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'COPY WEEK' }))

    await waitFor(() => {
      const call = spy.mock.calls.find(([url]) => String(url) === '/api/admin/roster/copy')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({
        venueId: 'v1', sourceStart: '2026-11-09', targetStart: '2026-11-16', mode: 'ADD',
      })
    })
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(await screen.findByText('COPIED — 4 CREATED')).toBeDefined()
    expect(onDone).toHaveBeenCalled()
  })

  it('warns before REPLACE and does nothing when cancelled', async () => {
    const spy = mockFetch(() => ({ created: 4 }))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderModal()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'REPLACE' } })
    fireEvent.click(screen.getByRole('button', { name: 'COPY WEEK' }))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('INCLUDING PUBLISHED SHIFTS'))
    expect(spy.mock.calls.some(([url]) => String(url) === '/api/admin/roster/copy')).toBe(false)
  })

  it('copies in REPLACE mode after confirmation', async () => {
    const spy = mockFetch(() => ({ created: 2, replaced: 5 }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderModal()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'REPLACE' } })
    fireEvent.click(screen.getByRole('button', { name: 'COPY WEEK' }))

    await waitFor(() => {
      const call = spy.mock.calls.find(([url]) => String(url) === '/api/admin/roster/copy')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({ mode: 'REPLACE' })
    })
    expect(await screen.findByText('COPIED — 2 CREATED · 5 REPLACED')).toBeDefined()
  })
})
