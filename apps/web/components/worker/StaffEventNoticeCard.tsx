'use client'

import { useState } from 'react'

export interface StaffEventNoticeData {
  id: string
  title: string
  description: string | null
  location: string | null
  startsAt: string
  endsAt: string | null
  allDay: boolean
  attendanceRequired: boolean
  allowMaybe: boolean
  requireDeclineReason: boolean
  responseDeadline: string | null
  notes: string | null
  organiserName: string | null
  reminderSentAt: string | null
  response: string
  respondedAt: string | null
  reason: string | null
  canRespond: boolean
  allowedResponses: string[]
  icsUrl: string
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NZ', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
}

function timeLabel(event: Pick<StaffEventNoticeData, 'startsAt' | 'endsAt' | 'allDay'>): string {
  if (event.allDay) return 'ALL DAY'
  const start = event.startsAt.slice(11, 16)
  const end = event.endsAt?.slice(11, 16)
  return end ? `${start}–${end}` : start
}

const RESPONSE_LABEL: Record<string, string> = {
  PENDING: 'NOT YET RESPONDED',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  MAYBE: 'MAYBE',
}

export function StaffEventNoticeCard({
  event,
  busy,
  onRespond,
}: {
  event: StaffEventNoticeData
  busy: boolean
  onRespond: (id: string, response: 'ACCEPTED' | 'DECLINED' | 'MAYBE', reason?: string) => void
}) {
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')

  const mayMaybe = event.allowMaybe && event.allowedResponses.includes('MAYBE')
  const responded = event.response !== 'PENDING'
  const reminderDue = !!event.reminderSentAt && !responded

  function decline() {
    if (event.requireDeclineReason && !declining) { setDeclining(true); return }
    if (event.requireDeclineReason && !reason.trim()) return
    onRespond(event.id, 'DECLINED', reason.trim() || undefined)
  }

  return (
    <div className="bg-grey-dark border border-grey-mid p-4 status-bar-warning">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-accent">📌</span>
            <span className="font-mono text-sm font-semibold uppercase text-white">{event.title}</span>
            <span className="font-mono text-2xs uppercase border border-grey-mid px-1.5 py-0.5 text-grey-light">
              {event.attendanceRequired ? 'ATTENDANCE REQUIRED' : 'OPTIONAL'}
            </span>
            <span className="font-mono text-2xs uppercase text-warning">STAFF EVENT</span>
          </div>
          <p className="font-mono text-xs uppercase text-grey-light mt-1">FROM {event.organiserName ?? 'THE VENUE'}</p>
        </div>
        <span className={`font-mono text-2xs uppercase border px-1.5 py-0.5 ${
          responded ? 'text-success border-success/50' : 'text-warning border-warning/50'
        }`}>
          {RESPONSE_LABEL[event.response] ?? 'NOT YET RESPONDED'}
        </span>
      </div>

      <div className="mt-3 space-y-1">
        <div className="font-mono text-sm text-white uppercase">{dayLabel(event.startsAt)} · {timeLabel(event)}</div>
        <div className="font-mono text-xs uppercase text-grey-light">{event.location?.trim() || 'LOCATION TO BE CONFIRMED'}</div>
        {event.responseDeadline && (
          <div className="font-mono text-xs uppercase text-grey-light">
            RESPOND BY {dayLabel(event.responseDeadline)} {event.responseDeadline.slice(11, 16)}
          </div>
        )}
      </div>

      {event.description && (
        <p className="font-sans text-sm text-grey-light mt-2 whitespace-pre-wrap">{event.description}</p>
      )}
      {event.notes && (
        <p className="font-mono text-xs uppercase text-accent mt-2 whitespace-pre-wrap">NOTES: {event.notes}</p>
      )}
      {reminderDue && (
        <p className="font-mono text-xs uppercase text-warning mt-2">REMINDER — THE ORGANISER IS WAITING FOR YOUR REPLY.</p>
      )}
      {responded && event.reason && event.response === 'DECLINED' && (
        <p className="font-mono text-xs text-grey-light mt-2 uppercase">REASON: {event.reason}</p>
      )}

      {event.canRespond ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onRespond(event.id, 'ACCEPTED')}
              disabled={busy}
              className={`h-12 border font-mono font-bold text-xs uppercase tracking-widest transition-colors disabled:opacity-40 ${
                event.response === 'ACCEPTED'
                  ? 'bg-success text-black border-success'
                  : 'bg-transparent text-success border-success hover:bg-success hover:text-black'
              }`}
            >
              {busy ? 'SAVING_' : 'ACCEPT'}
            </button>
            <button
              onClick={decline}
              disabled={busy}
              className={`h-12 border font-mono font-bold text-xs uppercase tracking-widest transition-colors disabled:opacity-40 ${
                event.response === 'DECLINED'
                  ? 'bg-danger text-black border-danger'
                  : 'bg-transparent text-danger border-danger hover:bg-danger hover:text-black'
              }`}
            >
              DECLINE
            </button>
            {mayMaybe && (
              <button
                onClick={() => onRespond(event.id, 'MAYBE')}
                disabled={busy}
                className={`h-12 border font-mono font-bold text-xs uppercase tracking-widest transition-colors disabled:opacity-40 ${
                  event.response === 'MAYBE'
                    ? 'bg-warning text-black border-warning'
                    : 'bg-transparent text-warning border-warning hover:bg-warning hover:text-black'
                } ${mayMaybe ? 'col-span-2' : ''}`}
              >
                MAYBE
              </button>
            )}
          </div>

          {declining && event.requireDeclineReason && (
            <div className="border border-grey-mid p-2 space-y-2">
              <label className="block font-mono text-xs uppercase text-grey-light">WHY CAN&apos;T YOU ATTEND? (REQUIRED)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={decline}
                  disabled={busy || !reason.trim()}
                  className="h-10 px-3 border border-danger text-danger font-mono text-xs uppercase tracking-wider hover:bg-danger hover:text-black transition-colors disabled:opacity-40"
                >
                  CONFIRM DECLINE
                </button>
                <button
                  onClick={() => { setDeclining(false); setReason('') }}
                  className="h-10 px-3 border border-grey-mid text-grey-light font-mono text-xs uppercase tracking-wider hover:border-white hover:text-white transition-colors"
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          <p className="font-mono text-2xs uppercase text-grey-light">YOU CAN CHANGE YOUR ANSWER UNTIL THE DEADLINE.</p>
        </div>
      ) : (
        <p className="mt-3 font-mono text-xs uppercase text-grey-light">RESPONSES ARE CLOSED FOR THIS EVENT.</p>
      )}

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {event.response === 'ACCEPTED' && (
          <a
            href={event.icsUrl}
            className="inline-block h-11 leading-[2.75rem] px-4 bg-white text-black font-mono font-bold text-xs uppercase tracking-widest"
          >
            ADD TO CALENDAR
          </a>
        )}
        <a href={`/w/staff-events/${event.id}`} className="font-mono text-xs uppercase text-accent hover:text-white transition-colors">
          FULL DETAILS →
        </a>
      </div>
    </div>
  )
}
