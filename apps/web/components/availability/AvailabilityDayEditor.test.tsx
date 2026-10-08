import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AvailabilityDayEditor } from '@/components/availability/AvailabilityDayEditor'
import { DEFAULT_AVAILABILITY_PRESETS, type AvailabilityEntry, type AvailabilitySeries } from '@/lib/availability'

const series: AvailabilitySeries = { id: 's1', startDate: '2026-10-06', endDate: '2026-10-20', count: 3 }

function entry(over: Partial<AvailabilityEntry> = {}): AvailabilityEntry {
  return {
    id: 'a1',
    date: '2026-10-08',
    type: 'UNAVAILABLE',
    isAllDay: true,
    startTime: null,
    endTime: null,
    windows: [],
    status: 'PENDING',
    timeOff: false,
    notes: null,
    reason: null,
    reviewNote: null,
    seriesId: null,
    seriesEndDate: null,
    ...over,
  }
}

function renderEditor(props: Partial<Parameters<typeof AvailabilityDayEditor>[0]> = {}) {
  const onSave = vi.fn()
  const onClear = vi.fn()
  const onClose = vi.fn()
  render(
    <AvailabilityDayEditor
      dateKey="2026-10-08"
      entry={null}
      series={null}
      presets={DEFAULT_AVAILABILITY_PRESETS}
      onSave={onSave}
      onClear={onClear}
      onClose={onClose}
      {...props}
    />,
  )
  return { onSave, onClear, onClose }
}

describe('AvailabilityDayEditor', () => {
  it('adds a quick-pick window with the auto-complement and saves all windows', () => {
    const { onSave } = renderEditor()

    fireEvent.click(screen.getByText('ALL DAY'))
    fireEvent.click(screen.getByText('MORNING'))
    fireEvent.click(screen.getByText('SAVE'))

    expect(onSave).toHaveBeenCalledTimes(1)
    const draft = onSave.mock.calls[0][0]
    expect(draft.isAllDay).toBe(false)
    expect(draft.windows).toEqual([
      { type: 'UNAVAILABLE', startTime: '00:00', endTime: '07:00' },
      { type: 'AVAILABLE', startTime: '07:00', endTime: '12:00' },
      { type: 'UNAVAILABLE', startTime: '12:00', endTime: '24:00' },
    ])
  })

  it('ticks time off and passes the note through', () => {
    const { onSave } = renderEditor()

    fireEvent.click(screen.getByText('TIME OFF REQUEST'))
    fireEvent.change(screen.getByPlaceholderText('NOTE (OPTIONAL)'), { target: { value: 'FAMILY WEDDING' } })
    fireEvent.click(screen.getByText('SAVE'))

    const draft = onSave.mock.calls[0][0]
    expect(draft.timeOff).toBe(true)
    expect(draft.notes).toBe('FAMILY WEDDING')
  })

  it('offers the series scopes and passes the chosen one', () => {
    const { onSave } = renderEditor({
      entry: entry({ seriesId: 's1', type: 'UNAVAILABLE', status: 'APPROVED' }),
      series,
    })

    expect(screen.getByText('JUST THIS DAY')).toBeDefined()
    fireEvent.click(screen.getByText('FROM THIS DAY ONWARDS'))
    fireEvent.click(screen.getByText('SAVE (ASKS A MANAGER)'))

    const options = onSave.mock.calls[0][1]
    expect(options.scope).toBe('FROM')
  })

  it('keeps THIS as the default scope and flags an approved day', () => {
    const { onSave } = renderEditor({ entry: entry({ status: 'APPROVED' }) })

    expect(screen.getByText(/CONFIRMED BY A MANAGER/)).toBeDefined()
    fireEvent.click(screen.getByText('SAVE (ASKS A MANAGER)'))
    expect(onSave.mock.calls[0][1].scope).toBeNull()
  })

  it('clears through the provided scope callback', () => {
    const { onClear } = renderEditor({ entry: entry({ seriesId: 's1' }), series })

    fireEvent.click(screen.getByText('ALL IN THE SERIES'))
    fireEvent.click(screen.getByText('CLEAR'))
    expect(onClear).toHaveBeenCalledWith({ scope: 'ALL', reason: null })
  })

  it('moves the neighbouring edge when a partition boundary is edited — no extra block', () => {
    const { onSave } = renderEditor({
      entry: entry({
        type: 'AVAILABLE',
        isAllDay: false,
        windows: [
          { type: 'UNAVAILABLE', startTime: '00:00', endTime: '09:00' },
          { type: 'AVAILABLE', startTime: '09:00', endTime: '17:00' },
          { type: 'UNAVAILABLE', startTime: '17:00', endTime: '24:00' },
        ],
      }),
    })

    // Third row's start select → push the unavailable block to 18:00.
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[4], { target: { value: '18:00' } })
    fireEvent.click(screen.getByText('SAVE'))

    expect(onSave.mock.calls[0][0].windows).toEqual([
      { type: 'UNAVAILABLE', startTime: '00:00', endTime: '09:00' },
      { type: 'AVAILABLE', startTime: '09:00', endTime: '18:00' },
      { type: 'UNAVAILABLE', startTime: '18:00', endTime: '24:00' },
    ])
  })
})
