import { describe, expect, it } from 'vitest'
import {
  AVAILABILITY_HISTORY_STATUSES,
  attachHistoryComments,
  describeHistoryRequest,
  filterHistoryDays,
  filterHistoryRequests,
  historyActorLabel,
  historyRequestDates,
  historyRequestInWindow,
  historyRequestStatus,
  historyStatusMeta,
  historySummary,
  SERIES_DELETED_NOTE,
  sortHistoryDays,
  sortHistoryRequests,
  type AvailabilityHistoryComment,
  type HistoryRequestLike,
} from '@/lib/availability-history'

const request = (over: Partial<HistoryRequestLike> = {}): HistoryRequestLike => ({
  id: 'r1',
  staffId: 'st1',
  date: '2026-10-15',
  scope: 'THIS',
  seriesId: null,
  action: 'SET',
  payload: {
    availability: { isAllDay: true, type: 'UNAVAILABLE', windows: [], timeOff: false, notes: null },
    writeDates: ['2026-10-15'],
    removeDates: [],
  },
  reason: 'SWAPPED A SHIFT',
  status: 'PENDING',
  reviewNote: null,
  reviewedById: null,
  reviewedAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  ...over,
})

describe('history request status', () => {
  it('labels every stored status', () => {
    for (const status of AVAILABILITY_HISTORY_STATUSES) {
      if (status === 'WITHDRAWN' || status === 'REMOVED') continue
      expect(historyRequestStatus({ status, deleted: false, staffId: 'st1', reviewedById: null, reviewNote: null })).toBe(status)
      expect(historyStatusMeta(status).label).toBe(status)
    }
  })

  it('shows a worker self-withdrawal as WITHDRAWN', () => {
    expect(historyRequestStatus({
      status: 'DISCARDED', deleted: true, staffId: 'st1', reviewedById: 'st1', reviewNote: null,
    })).toBe('WITHDRAWN')
    expect(historyStatusMeta('WITHDRAWN').label).toBe('WITHDRAWN')
  })

  it('keeps a manager dismissal DISCARDED, never WITHDRAWN', () => {
    expect(historyRequestStatus({
      status: 'DISCARDED', deleted: true, staffId: 'st1', reviewedById: 'm1', reviewNote: SERIES_DELETED_NOTE,
    })).toBe('DISCARDED')
  })

  it('keeps a manager deleting their own series DISCARDED, not WITHDRAWN', () => {
    expect(historyRequestStatus({
      status: 'DISCARDED', deleted: true, staffId: 'm1', reviewedById: 'm1', reviewNote: SERIES_DELETED_NOTE,
    })).toBe('DISCARDED')
  })

  it('labels a legacy soft-deleted PENDING row REMOVED, not WITHDRAWN', () => {
    expect(historyRequestStatus({
      status: 'PENDING', deleted: true, staffId: 'st1', reviewedById: null, reviewNote: null,
    })).toBe('REMOVED')
    expect(historyStatusMeta('REMOVED').label).toBe('REMOVED')
  })

  it('treats a legacy soft-deleted DISCARDED row without a reviewer as WITHDRAWN', () => {
    expect(historyRequestStatus({
      status: 'DISCARDED', deleted: true, staffId: 'st1', reviewedById: null, reviewNote: null,
    })).toBe('WITHDRAWN')
  })

  it('falls back to PENDING for an unknown stored status', () => {
    expect(historyRequestStatus({
      status: 'SOMETHING', deleted: false, staffId: 'st1', reviewedById: null, reviewNote: null,
    })).toBe('PENDING')
  })
})

describe('history actor', () => {
  const names = new Map([['m1', 'MORGAN LEE']])

  it('names a known reviewer', () => {
    expect(historyActorLabel('m1', '2026-10-02T00:00:00.000Z', names)).toBe('MORGAN LEE')
  })

  it('says AUTOMATIC when only a review time is stamped (auto-supersede)', () => {
    expect(historyActorLabel(null, '2026-10-02T00:00:00.000Z', names)).toBe('AUTOMATIC')
  })

  it('names a removed reviewer instead of dropping the stamp', () => {
    expect(historyActorLabel('gone', '2026-10-02T00:00:00.000Z', names)).toBe('REMOVED STAFF')
  })

  it('returns null while unreviewed', () => {
    expect(historyActorLabel(null, null, names)).toBeNull()
  })
})

describe('describeHistoryRequest', () => {
  it('describes an all-day SET proposal', () => {
    expect(describeHistoryRequest(request())).toBe('ALL DAY UNAVAILABLE')
  })

  it('describes a windowed SET proposal', () => {
    const row = request({
      payload: {
        availability: {
          isAllDay: false,
          type: 'UNAVAILABLE',
          windows: [{ type: 'AVAILABLE', startTime: '07:00', endTime: '15:00' }],
          timeOff: false,
          notes: null,
        },
        writeDates: ['2026-10-15'],
      },
    })
    expect(describeHistoryRequest(row)).toBe('07:00–15:00')
  })

  it('labels CLEAR by its scope', () => {
    expect(describeHistoryRequest(request({ action: 'CLEAR', scope: 'THIS' }))).toBe('CLEAR THIS DAY')
    expect(describeHistoryRequest(request({ action: 'CLEAR', scope: 'FROM' }))).toBe('REMOVE SERIES FROM THIS DAY')
    expect(describeHistoryRequest(request({ action: 'CLEAR', scope: 'ALL' }))).toBe('REMOVE WHOLE SERIES')
  })

  it('falls back to a dash when a SET payload is missing', () => {
    expect(describeHistoryRequest(request({ payload: null }))).toBe('—')
  })
})

describe('request dates and window', () => {
  it('uses every target date, not the anchor', () => {
    const row = request({
      date: '2026-10-01',
      payload: { writeDates: ['2026-10-15', '2026-10-22'], removeDates: ['2026-10-08'] },
    })
    expect(historyRequestDates(row)).toEqual(['2026-10-08', '2026-10-15', '2026-10-22'])
  })

  it('falls back to the anchor when the payload has no plan dates', () => {
    expect(historyRequestDates(request({ payload: null }))).toEqual(['2026-10-15'])
  })

  it('matches a window on any target date even when the anchor is outside it', () => {
    const row = request({ date: '2026-09-01', payload: { writeDates: ['2026-10-15'] } })
    expect(historyRequestInWindow(row, '2026-10-01', '2026-10-31')).toBe(true)
    expect(historyRequestInWindow(row, '2026-11-01', '2026-11-30')).toBe(false)
  })
})

describe('filterHistoryRequests', () => {
  const rows = [
    request({ id: 'a', staffId: 'st1', status: 'APPLIED' }),
    request({ id: 'b', staffId: 'st2', status: 'PENDING' }),
    request({ id: 'c', staffId: 'st1', status: 'DISCARDED', deleted: true, date: '2026-10-20', payload: { writeDates: ['2026-10-20'] } }),
    // A legacy delete-series dismissal: soft-deleted with no status/reviewer stamp.
    request({ id: 'd', staffId: 'st2', status: 'PENDING', deleted: true, date: '2026-10-21', payload: { writeDates: ['2026-10-21'] } }),
  ]

  it('filters by staff and status', () => {
    expect(filterHistoryRequests(rows, { staffId: 'st1' }).map((r) => r.id)).toEqual(['a', 'c'])
    expect(filterHistoryRequests(rows, { status: 'APPLIED' }).map((r) => r.id)).toEqual(['a'])
  })

  it('keeps withdrawn and removed requests by default and can hide both', () => {
    expect(filterHistoryRequests(rows).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(filterHistoryRequests(rows, { includeWithdrawn: false }).map((r) => r.id)).toEqual(['a', 'b'])
    expect(filterHistoryRequests(rows, { status: 'WITHDRAWN' }).map((r) => r.id)).toEqual(['c'])
    expect(filterHistoryRequests(rows, { status: 'REMOVED' }).map((r) => r.id)).toEqual(['d'])
  })

  it('filters on the days the request targets', () => {
    expect(filterHistoryRequests(rows, { from: '2026-10-18', to: '2026-10-25' }).map((r) => r.id)).toEqual(['c', 'd'])
  })
})

describe('sorting and day filters', () => {
  it('sorts requests newest first', () => {
    const rows = [
      request({ id: 'old', createdAt: '2026-10-01T00:00:00.000Z' }),
      request({ id: 'new', createdAt: '2026-10-09T00:00:00.000Z' }),
    ]
    expect(sortHistoryRequests(rows).map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('filters days by staff, date and cancelled flag', () => {
    const days = [
      { id: 'd1', staffId: 'st1', date: '2026-10-15', cancelled: false },
      { id: 'd2', staffId: 'st2', date: '2026-10-16', cancelled: false },
      { id: 'd3', staffId: 'st1', date: '2026-10-20', cancelled: true },
    ]
    expect(filterHistoryDays(days, { staffId: 'st1' }).map((d) => d.id)).toEqual(['d1', 'd3'])
    expect(filterHistoryDays(days, { from: '2026-10-16', to: '2026-10-18' }).map((d) => d.id)).toEqual(['d2'])
    expect(filterHistoryDays(days, { includeCancelled: false }).map((d) => d.id)).toEqual(['d1', 'd2'])
  })

  it('sorts days newest first then by person name', () => {
    const days = [
      { id: 'a', date: '2026-10-15', staffName: 'ZOE' },
      { id: 'b', date: '2026-10-20', staffName: 'AMY' },
      { id: 'c', date: '2026-10-15', staffName: 'AMY' },
    ]
    expect(sortHistoryDays(days).map((d) => d.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('comments and summary', () => {
  const comment = (over: Partial<AvailabilityHistoryComment>): AvailabilityHistoryComment => ({
    id: 'c1',
    staffId: 'st1',
    date: '2026-10-15',
    body: 'NOTE',
    source: 'MANAGER',
    authorName: 'MORGAN LEE',
    createdAt: '2026-10-02T00:00:00.000Z',
    ...over,
  })

  it('attaches a day thread newest first by staff + anchor date', () => {
    const rows = [
      { id: 'r1', staffId: 'st1', date: '2026-10-15' },
      { id: 'r2', staffId: 'st2', date: '2026-10-15' },
    ]
    const attached = attachHistoryComments(rows, [
      comment({ id: 'old', createdAt: '2026-10-01T00:00:00.000Z' }),
      comment({ id: 'new', createdAt: '2026-10-03T00:00:00.000Z' }),
      comment({ id: 'other', staffId: 'st2' }),
    ])
    expect(attached[0].comments.map((c) => c.id)).toEqual(['new', 'old'])
    expect(attached[1].comments.map((c) => c.id)).toEqual(['other'])
  })

  it('summarises request and day counts', () => {
    expect(historySummary(
      [request({ status: 'PENDING' }), request({ id: 'r2', status: 'APPLIED' })],
      [{ cancelled: false }, { cancelled: true }],
    )).toEqual({ requests: 2, pending: 1, days: 2, cancelled: 1 })
  })
})
