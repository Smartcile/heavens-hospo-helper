import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    lockedAt: null,
    lockedById: null,
    lockedReason: null,
    ...over,
  } as AvailabilityEntry
}

function renderEditor(props: Partial<Parameters<typeof AvailabilityDayEditor>[0]> = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(
    <AvailabilityDayEditor
      dateKey="2026-10-08"
      entry={null}
      series={null}
      presets={DEFAULT_AVAILABILITY_PRESETS}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />,
  )
  return { onSave, onClose }
}

describe('AvailabilityDayEditor', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ comments: [], canDelete: false }),
    } as Response)
  })

  afterEach(() => { vi.restoreAllMocks() })

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

  it('ticks time off and saves without a separate note input', () => {
    const { onSave } = renderEditor()

    fireEvent.click(screen.getByText('TIME OFF REQUEST'))
    expect(screen.queryByPlaceholderText('NOTE FOR THE MANAGER (OPTIONAL)')).toBeNull()
    expect(screen.getByText('COMMENTS')).toBeDefined()
    fireEvent.click(screen.getByText('SAVE'))

    const draft = onSave.mock.calls[0][0]
    expect(draft.timeOff).toBe(true)
    expect(draft.notes).toBeNull()
  })

  it('preserves an existing stored note when saving', () => {
    const { onSave } = renderEditor({ entry: entry({ notes: 'UNI ON TUESDAYS' }) })

    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave.mock.calls[0][0].notes).toBe('UNI ON TUESDAYS')
  })

  it('renders the comment thread instead of the old note areas', () => {
    renderEditor({ entry: entry({ notes: 'UNI ON TUESDAYS' }) })

    expect(screen.getByText('COMMENTS')).toBeDefined()
    expect(screen.getByPlaceholderText('ADD A COMMENT')).toBeDefined()
    expect(screen.queryByPlaceholderText('NOTE FOR THE MANAGER (OPTIONAL)')).toBeNull()
    expect(screen.queryByText('SAVE REVIEW NOTE')).toBeNull()
  })

  it('offers the series scopes and passes the chosen one', () => {
    const { onSave } = renderEditor({
      entry: entry({ seriesId: 's1', type: 'UNAVAILABLE', status: 'APPROVED' }),
      series,
    })

    expect(screen.getByText('JUST THIS DAY')).toBeDefined()
    expect(screen.getByText(/COMMENT IS STORED ON THIS DAY/)).toBeDefined()
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

  it('never shows a CLEAR button in the day popup', () => {
    renderEditor({ entry: entry({ seriesId: 's1' }), series })

    expect(screen.queryByText('CLEAR')).toBeNull()
  })

  it('shows DELETE SERIES only for a series when the admin allows it', () => {
    const onRequestDeleteSeries = vi.fn()
    renderEditor({
      entry: entry({ seriesId: 's1' }),
      series,
      canDeleteSeries: true,
      onRequestDeleteSeries,
    })

    fireEvent.click(screen.getByText('DELETE SERIES'))
    expect(onRequestDeleteSeries).toHaveBeenCalledTimes(1)
  })

  it('hides DELETE SERIES on a standalone day and for a worker', () => {
    renderEditor({ entry: entry(), canDeleteSeries: true, onRequestDeleteSeries: vi.fn() })
    expect(screen.queryByText('DELETE SERIES')).toBeNull()

    renderEditor({ entry: entry({ seriesId: 's1' }), series })
    expect(screen.queryByText('DELETE SERIES')).toBeNull()
  })

  it('never offers CLEAR, DELETE SERIES or ALL to a worker', () => {
    renderEditor({
      entry: entry({ seriesId: 's1' }),
      series,
      allowedScopes: ['THIS', 'FROM'],
      allowSeriesEnd: false,
      initialScope: 'FROM',
    })

    expect(screen.queryByText('CLEAR')).toBeNull()
    expect(screen.queryByText('DELETE SERIES')).toBeNull()
    expect(screen.queryByText('ALL IN THE SERIES')).toBeNull()
    expect(screen.getByText('FROM THIS DAY ONWARDS')).toBeDefined()
    expect(screen.getByText('JUST THIS DAY')).toBeDefined()
  })

  it('honours initialScope="THIS" for a worker series day', () => {
    const { onSave } = renderEditor({
      entry: entry({ seriesId: 's1' }),
      series,
      allowedScopes: ['THIS', 'FROM'],
      allowSeriesEnd: false,
      initialScope: 'THIS',
    })

    expect(screen.getByText('JUST THIS DAY').className).toContain('bg-white')
    expect(screen.getByText('FROM THIS DAY ONWARDS').className).not.toContain('bg-white')
    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave.mock.calls[0][1].scope).toBe('THIS')
  })

  it('honours an explicit initialScope="FROM" and explains the anchor', () => {
    const { onSave } = renderEditor({
      entry: entry({ seriesId: 's1' }),
      series,
      allowedScopes: ['THIS', 'FROM'],
      allowSeriesEnd: false,
      initialScope: 'FROM',
    })

    expect(screen.getByText(/ONWARDS — PAST DAYS UNCHANGED/)).toBeDefined()
    expect(screen.queryByText('CHANGE SERIES END')).toBeNull()
    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave.mock.calls[0][1].scope).toBe('FROM')
  })

  it('offers REQUEST REMOVAL only on a series day when allowed', () => {
    const onRequestSeriesRemoval = vi.fn()
    renderEditor({
      entry: entry({ seriesId: 's1' }),
      series,
      allowedScopes: ['THIS', 'FROM'],
      allowSeriesEnd: false,
      canRequestRemoval: true,
      onRequestSeriesRemoval,
    })

    fireEvent.click(screen.getByText('REQUEST REMOVAL'))
    expect(onRequestSeriesRemoval).toHaveBeenCalledTimes(1)
  })

  it('hides REQUEST REMOVAL on a standalone day', () => {
    renderEditor({
      entry: entry(),
      canRequestRemoval: true,
      onRequestSeriesRemoval: vi.fn(),
    })

    expect(screen.queryByText('REQUEST REMOVAL')).toBeNull()
  })

  it('shows the resulting end date when putting an end on a no-end series', () => {
    const openSeries: AvailabilitySeries = { id: 's2', startDate: '2026-10-06', endDate: null, count: 104 }
    renderEditor({ entry: entry({ seriesId: 's2', status: 'APPROVED' }), series: openSeries })

    fireEvent.click(screen.getByText('CHANGE SERIES END'))
    // Untick NO END DATE → the stepper appears with a concrete end date.
    fireEvent.click(screen.getByRole('checkbox', { name: /NO END DATE/ }))
    fireEvent.click(screen.getByText('FROM THIS DAY ONWARDS'))

    // 2026-10-08 + 2 weekly occurrences → ENDS 15 OCT 2026.
    expect(screen.getByText(/ENDS 15 OCT 2026/)).toBeDefined()
  })

  it('blocks JUST THIS DAY while a series end change is armed', () => {
    const { onSave } = renderEditor({ entry: entry({ seriesId: 's1', status: 'APPROVED' }), series })

    fireEvent.click(screen.getByText('CHANGE SERIES END'))
    const thisDay = screen.getByText('JUST THIS DAY').closest('button') as HTMLButtonElement
    expect(thisDay.disabled).toBe(true)
    // The scope auto-moves to FROM so the end change can actually apply.
    fireEvent.click(screen.getByText('SAVE (ASKS A MANAGER)'))
    expect(onSave.mock.calls[0][1].scope).toBe('FROM')
  })

  it('explains that JUST THIS DAY detaches from the series', () => {
    renderEditor({ entry: entry({ seriesId: 's1' }), series })
    expect(screen.getByText(/LEAVES THE SERIES/)).toBeDefined()
  })

  it('locks availability controls but keeps the comment thread for an admin', async () => {
    const onToggleLock = vi.fn()
    renderEditor({
      entry: entry({ status: 'APPROVED', lockedAt: '2026-10-20T01:00:00.000Z', lockedReason: 'CONFIRMED' }),
      canOverride: true,
      staffId: 'st1',
      onToggleLock,
    })

    expect(screen.getByText(/LOCKED — UNLOCK TO EDIT/)).toBeDefined()
    const allDay = screen.getByText('ALL DAY').closest('button') as HTMLButtonElement
    const controls = allDay.closest('fieldset') as HTMLFieldSetElement
    expect(controls.disabled).toBe(true)

    // Comments stay writable on a locked day (once the capability loads).
    expect(await screen.findByPlaceholderText('ADD A COMMENT')).toBeDefined()
    expect(screen.queryByPlaceholderText('NOTE FOR THE MANAGER (OPTIONAL)')).toBeNull()

    fireEvent.click(screen.getByText('UNLOCK'))
    expect(onToggleLock).toHaveBeenCalledWith(false, null)
  })

  it('shows the comment thread (with the admin staff id) instead of a review note', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        comments: [{
          id: 'c1', body: 'CHECKED BY PHONE', source: 'MANAGER', authorId: 'm1',
          authorName: 'MORGAN LEE', createdAt: '2026-11-12T03:00:00.000Z', canDelete: true,
        }],
        canDelete: true,
      }),
    } as Response)

    renderEditor({ entry: entry({ reviewNote: 'OLD REVIEW' }), canOverride: true, staffId: 'st1' })

    expect(await screen.findByText('CHECKED BY PHONE')).toBeDefined()
    expect(screen.queryByLabelText('Review note')).toBeNull()
    expect(screen.queryByText('SAVE REVIEW NOTE')).toBeNull()
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/admin/availability/comments')
    expect(String(fetchSpy.mock.calls[0][0])).toContain('staffId=st1')
  })

  it('keeps the review note read-only for a worker (no review inputs)', () => {
    renderEditor({ entry: entry({ reviewNote: 'MANAGER ONLY' }) })

    expect(screen.queryByText(/MANAGER: MANAGER ONLY/)).toBeNull()
    expect(screen.queryByLabelText('Review note')).toBeNull()
    expect(screen.queryByText('SAVE REVIEW NOTE')).toBeNull()
    expect(screen.getByText('COMMENTS')).toBeDefined()
  })

  it('does not resurrect a deleted comment when saving', async () => {
    let deleted = false
    vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/api/worker/availability/comments')) {
        if (init?.method === 'DELETE') {
          deleted = true
          return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            canAdd: true,
            canDelete: true,
            comments: deleted ? [] : [{
              id: 'c1', body: 'DELETED TEXT', source: 'WORKER_APP', authorId: 'st1',
              authorName: 'TAYLOR REED', createdAt: '2026-11-12T01:00:00.000Z', canDelete: true,
            }],
          }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({ comments: [] }) } as Response
    })

    const { onSave } = renderEditor({ entry: entry({ notes: 'ORIGINAL' }) })
    expect(await screen.findByText('DELETED TEXT')).toBeDefined()

    fireEvent.click(screen.getByLabelText('Delete comment c1'))
    await waitFor(() => expect(screen.queryByText('DELETED TEXT')).toBeNull())

    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave.mock.calls[0][0].notes).toBeNull()
    expect(onSave.mock.calls[0][1].reason).toBeNull()
  })

  it('hides add and delete controls when the manager has no edit grant', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        canAdd: false,
        canDelete: false,
        comments: [{
          id: 'c1', body: 'READ ONLY', source: 'MANAGER', authorId: 'm1',
          authorName: 'MORGAN LEE', createdAt: '2026-11-12T01:00:00.000Z', canDelete: false,
        }],
      }),
    } as Response)

    renderEditor({ canOverride: true, staffId: 'st1' })
    expect(await screen.findByText('READ ONLY')).toBeDefined()
    expect(screen.queryByPlaceholderText('ADD A COMMENT')).toBeNull()
    expect(screen.queryByLabelText('Delete comment c1')).toBeNull()
  })

  it('never sends a manager comment as the worker request reason', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        canAdd: true,
        canDelete: false,
        comments: [{
          id: 'c1', body: 'MANAGER NOTE', source: 'MANAGER', authorId: 'm1',
          authorName: 'MORGAN LEE', createdAt: '2026-11-12T01:00:00.000Z', canDelete: false,
        }],
      }),
    } as Response)

    const { onSave } = renderEditor()
    expect(await screen.findByText('MANAGER NOTE')).toBeDefined()

    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave.mock.calls[0][0].notes).toBe('MANAGER NOTE')
    expect(onSave.mock.calls[0][1].reason).toBeNull()
  })

  it('uses the newest WORKER_APP comment for the request reason even when a manager commented later', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        canAdd: true,
        canDelete: false,
        comments: [
          {
            id: 'c2', body: 'MANAGER REPLY', source: 'MANAGER', authorId: 'm1',
            authorName: 'MORGAN LEE', createdAt: '2026-11-12T02:00:00.000Z', canDelete: false,
          },
          {
            id: 'c1', body: 'WORKER NOTE', source: 'WORKER_APP', authorId: 'st1',
            authorName: 'TAYLOR REED', createdAt: '2026-11-12T01:00:00.000Z', canDelete: false,
          },
        ],
      }),
    } as Response)

    const { onSave } = renderEditor()
    expect(await screen.findByText('MANAGER REPLY')).toBeDefined()

    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave.mock.calls[0][0].notes).toBe('MANAGER REPLY')
    expect(onSave.mock.calls[0][1].reason).toBe('WORKER NOTE')
  })

  it('sends manager-locked worker saves as a change request with the chosen scope', () => {
    const { onSave } = renderEditor({
      entry: entry({ seriesId: 's1', status: 'APPROVED', lockedAt: '2026-10-20T01:00:00.000Z' }),
      series,
      allowedScopes: ['THIS', 'FROM'],
      allowSeriesEnd: false,
      initialScope: 'FROM',
    })

    expect(screen.getByText(/LOCKED BY A MANAGER/)).toBeDefined()
    expect(screen.getByText('FROM THIS DAY ONWARDS')).toBeDefined()
    expect(screen.queryByText('ALL IN THE SERIES')).toBeNull()
    expect(screen.queryByText('CHANGE SERIES END')).toBeNull()

    fireEvent.click(screen.getByText('SEND CHANGE REQUEST'))
    expect(onSave.mock.calls[0][1].scope).toBe('FROM')
    expect(onSave.mock.calls[0][1].repeat).toBeNull()
  })

  it('keeps REPEAT WEEKLY working for a worker on a brand-new day', () => {
    const { onSave } = renderEditor({ allowedScopes: ['THIS', 'FROM'], allowSeriesEnd: false })

    fireEvent.click(screen.getByText('REPEAT WEEKLY'))
    fireEvent.click(screen.getByText('SAVE'))

    expect(onSave.mock.calls[0][1].repeat).toEqual({ weeks: 2 })
    expect(onSave.mock.calls[0][1].scope).toBeNull()
  })

  it('offers LOCK with an optional reason on an unlocked admin day', () => {
    const onToggleLock = vi.fn()
    renderEditor({ entry: entry({ status: 'APPROVED' }), canOverride: true, onToggleLock })

    fireEvent.change(screen.getByLabelText('Lock reason'), { target: { value: 'AGREED ON THE PHONE' } })
    fireEvent.click(screen.getByText('LOCK'))
    expect(onToggleLock).toHaveBeenCalledWith(true, 'AGREED ON THE PHONE')
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

  it('adds a new window on a full-day partition instead of doing nothing', () => {
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

    fireEvent.click(screen.getByText('+ ADD WINDOW'))
    fireEvent.click(screen.getByText('SAVE'))

    expect(onSave.mock.calls[0][0].windows).toEqual([
      { type: 'UNAVAILABLE', startTime: '00:00', endTime: '09:00' },
      { type: 'AVAILABLE', startTime: '09:00', endTime: '13:00' },
      { type: 'AVAILABLE', startTime: '13:00', endTime: '17:00' },
      { type: 'UNAVAILABLE', startTime: '17:00', endTime: '24:00' },
    ])
  })

  it('can turn the new row into a real gap that survives save', () => {
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

    fireEvent.click(screen.getByText('+ ADD WINDOW'))
    // The new row is the second AVAILABLE block (index 2): push its start to 14:00.
    fireEvent.change(screen.getAllByRole('combobox')[4], { target: { value: '14:00' } })
    fireEvent.click(screen.getByText('SAVE'))

    expect(onSave.mock.calls[0][0].windows).toEqual([
      { type: 'UNAVAILABLE', startTime: '00:00', endTime: '09:00' },
      { type: 'AVAILABLE', startTime: '09:00', endTime: '13:00' },
      { type: 'UNAVAILABLE', startTime: '13:00', endTime: '14:00' },
      { type: 'AVAILABLE', startTime: '14:00', endTime: '17:00' },
      { type: 'UNAVAILABLE', startTime: '17:00', endTime: '24:00' },
    ])
  })
})
