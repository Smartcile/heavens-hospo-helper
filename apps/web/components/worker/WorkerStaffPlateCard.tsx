'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { normalisePlate } from '@/lib/parking'
import { describePlateStatus, describeRequestStatus } from '@/lib/staff-parking'

interface StaffPlate {
  id: string
  plate: string
  status: string
  enteredInSystem: boolean
  createdAt: string
}

interface StaffPlateRequest {
  id: string
  plate: string
  previousPlate: string | null
  reason: string | null
  status: string
  reviewNote: string | null
  createdAt: string
}

interface StaffPlateData {
  enabled: boolean
  plates?: StaffPlate[]
  requests?: StaffPlateRequest[]
  settings?: { name: string; notes: string | null }
}

interface FormState {
  plate: string
  reason: string
  replacePlateId: string | null
}

const EMPTY_FORM: FormState = { plate: '', reason: '', replacePlateId: null }

export function WorkerStaffPlateCard() {
  const [data, setData] = useState<StaffPlateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/worker/parking/staff-plate')
      if (res.status === 401) {
        window.location.href = '/w/login'
        return
      }
      if (!res.ok) return
      setData(await res.json())
    } catch {
      // Keep the last payload; a retry updates it.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const plates = data?.plates ?? []
  const activePlates = plates.filter((row) => row.status === 'ACTIVE')
  const requests = data?.requests ?? []

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setError('')
    setMessage('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/worker/parking/staff-plate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licensePlate: form.plate,
          reason: form.reason,
          replacePlateId: form.replacePlateId,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'COULD NOT SEND THAT PLATE')
        return
      }
      setForm(null)
      setMessage('SENT TO THE MANAGER FOR APPROVAL')
      await load()
    } catch {
      setError('COULD NOT CONNECT — TRY AGAIN')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !data?.enabled || !Array.isArray(data.plates)) return null

  function openAdd() {
    setError('')
    setMessage('')
    setForm({ ...EMPTY_FORM })
  }

  function openChange(plate: StaffPlate) {
    setError('')
    setMessage('')
    setForm({ ...EMPTY_FORM, replacePlateId: plate.id })
  }

  return (
    <div className="border border-grey-mid p-4 space-y-3" id="staff-plate-card">
      <div>
        <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">
          MY NUMBER PLATE
        </h2>
        <p className="font-mono text-2xs uppercase text-grey-light">
          {data.settings?.name || 'STAFF CARPARK'}
        </p>
      </div>

      {data.settings?.notes && (
        <p className="font-mono text-xs text-grey-light">{data.settings.notes}</p>
      )}

      {activePlates.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">
          NO STAFF PLATE ON FILE YET.
        </p>
      ) : (
        <div className="space-y-2">
          {activePlates.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 border border-grey-mid px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-mono text-lg tracking-[0.2em] text-white">{row.plate}</p>
                <p className="font-mono text-2xs uppercase text-grey-light">
                  {describePlateStatus(row.status)} ·{' '}
                  {row.enteredInSystem ? 'IN THE SYSTEM' : 'NOT IN THE SYSTEM YET'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openChange(row)}
                className="shrink-0 border border-grey-mid px-3 py-2 font-mono text-2xs uppercase text-white"
              >
                CHANGE
              </button>
            </div>
          ))}
        </div>
      )}

      {requests.length > 0 && (
        <div className="space-y-1">
          <p className="font-mono text-2xs uppercase tracking-wider text-grey-light">REQUESTS</p>
          {requests.slice(0, 6).map((row) => (
            <div key={row.id} className="border-l border-grey-mid pl-2">
              <p className="font-mono text-xs text-white">
                {row.plate}
                {row.previousPlate ? (
                  <span className="text-grey-light"> (WAS {row.previousPlate})</span>
                ) : null}
              </p>
              <p className="font-mono text-2xs uppercase text-grey-light">
                {describeRequestStatus(row.status)}
                {row.reason ? ` · ${row.reason}` : ''}
              </p>
              {row.reviewNote && (
                <p className="font-mono text-2xs text-grey-light">MANAGER: {row.reviewNote}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {message && <p className="font-mono text-xs text-success">{message}</p>}

      {form ? (
        <form onSubmit={submit} className="space-y-3 border-t border-grey-mid pt-3">
          <p className="font-mono text-xs uppercase tracking-wider text-white">
            {form.replacePlateId
              ? `CHANGE ${activePlates.find((row) => row.id === form.replacePlateId)?.plate ?? 'PLATE'}`
              : activePlates.length > 0
                ? 'ADD ANOTHER PLATE'
                : 'ADD MY NUMBER PLATE'}
          </p>
          <input
            value={form.plate}
            onChange={(e) =>
              setForm((current) =>
                current
                  ? { ...current, plate: normalisePlate(e.target.value).slice(0, 6) }
                  : current,
              )
            }
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            placeholder="ABC123"
            className="w-full border border-grey-mid bg-black px-3 py-3 text-center font-mono text-2xl tracking-[0.3em] text-white outline-none focus:border-white"
          />
          <textarea
            value={form.reason}
            onChange={(e) =>
              setForm((current) => (current ? { ...current, reason: e.target.value } : current))
            }
            rows={2}
            placeholder={
              activePlates.length > 0
                ? 'WHY IS THIS CHANGING? (REQUIRED)'
                : 'OPTIONAL NOTE'
            }
            className="w-full border border-grey-mid bg-black px-2 py-2 font-sans text-sm text-white outline-none focus:border-white"
          />
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setForm(null)
                setError('')
              }}
              className="border border-grey-mid py-2 font-mono text-xs uppercase text-white"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={submitting || form.plate.length === 0}
              className="border border-white bg-white py-2 font-mono text-xs font-bold uppercase text-black disabled:opacity-40"
            >
              {submitting ? 'SENDING…' : 'SEND FOR APPROVAL'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={openAdd}
          className="w-full border border-grey-mid py-2 font-mono text-xs uppercase tracking-wider text-white"
        >
          + {activePlates.length > 0 ? 'ADD ANOTHER PLATE' : 'ADD MY NUMBER PLATE'}
        </button>
      )}
    </div>
  )
}
