'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { pushToast } from '@/components/ui/Toast'
import { validClerkPin } from '@/lib/swiftpos-staff'

interface StaffRef {
  id: string
  firstName: string
  lastName: string
  swiftPosId: string | null
  isActive: boolean
}

interface ClerkRow {
  clerkId: string
  name: string
  status: 'LINKED' | 'SUGGESTED' | 'NEW'
  staffId: string | null
  staffName: string | null
  suggestedStaffId: string | null
}

interface StaffPayload {
  venueName: string
  baseUrl: string
  rows: ClerkRow[]
  staff: StaffRef[]
}

const STATUS_CLASS: Record<ClerkRow['status'], string> = {
  LINKED: 'text-success',
  SUGGESTED: 'text-accent',
  NEW: 'text-grey-light',
}

export function SwiftPosStaffSync({ venueId }: { venueId: string }) {
  const [data, setData] = useState<StaffPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [pins, setPins] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/swiftpos/staff?venueId=${encodeURIComponent(venueId)}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setData(null)
        setError(String(body.error ?? 'COULD NOT LOAD SWIFTPOS STAFF'))
        return
      }
      setData(body as StaffPayload)
      setSelected(Object.fromEntries((body.rows as ClerkRow[]).map((r) => [r.clerkId, r.suggestedStaffId ?? ''])))
      setPins(Object.fromEntries(
        (body.rows as ClerkRow[])
          .filter((r) => r.status !== 'LINKED' && validClerkPin(r.clerkId))
          .map((r) => [r.clerkId, r.clerkId]),
      ))
    } catch {
      setData(null)
      setError('COULD NOT REACH THE SERVER')
    } finally {
      setLoading(false)
    }
  }, [venueId])

  useEffect(() => { load() }, [load])

  async function act(row: ClerkRow, action: 'LINK' | 'UNLINK' | 'CREATE') {
    setBusy(`${action}:${row.clerkId}`)
    const res = await fetch('/api/admin/swiftpos/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        action,
        clerkId: row.clerkId,
        clerkName: row.name,
        staffId: action === 'UNLINK' ? row.staffId : selected[row.clerkId] || undefined,
        pin: action === 'CREATE' ? pins[row.clerkId] || row.clerkId : undefined,
      }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy('')
    if (!res.ok) {
      pushToast(String(body.error ?? 'ACTION FAILED'), 'error')
      return
    }
    pushToast(
      action === 'LINK' ? 'STAFF LINKED' : action === 'UNLINK' ? 'STAFF UNLINKED' : 'STAFF CREATED',
      'success',
    )
    await load()
  }

  if (loading && !data) {
    return <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
  }

  const staffOptions = (data?.staff ?? [])
    .filter((s) => !s.swiftPosId)
    .map((s) => ({
      value: s.id,
      label: `${s.firstName} ${s.lastName}`.trim() + (s.isActive ? '' : ' · INACTIVE'),
    }))

  const linked = data?.rows.filter((r) => r.status === 'LINKED').length ?? 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-mono text-sm uppercase tracking-widest text-white">SWIFTPOS STAFF</h2>
          <p className="font-mono text-2xs uppercase text-grey-light mt-0.5">
            PULL CLERKS FROM SWIFTDOSNET AND LINK THEM TO VENUE STAFF — OR CREATE A FLOOR PROFILE.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} loading={loading}>↻ REFRESH</Button>
      </div>

      {error && <p className="font-mono text-xs text-danger border border-danger p-2">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3 border border-grey-mid p-3">
            <Stat label="CLERKS" value={String(data.rows.length)} />
            <Stat label="LINKED" value={`${linked} / ${data.rows.length}`} />
            <Stat label="UNLINKED" value={String(data.rows.length - linked)} />
          </div>

          <div className="border border-grey-mid">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono text-xs">
                <thead>
                  <tr className="bg-grey-dark/40">
                    {['CLERK', 'NAME', 'STATUS', 'STAFF', 'PIN', 'ACTION'].map((h) => (
                      <th key={h} className="text-left uppercase tracking-wider text-grey-light px-3 py-1.5 border-b border-grey-mid whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-3 text-grey-light uppercase">NO CLERKS RETURNED BY SWIFTDOSNET.</td>
                    </tr>
                  )}
                  {data.rows.map((row) => {
                    const pin = pins[row.clerkId] ?? ''
                    const rowBusy = busy.endsWith(`:${row.clerkId}`)
                    return (
                      <tr key={row.clerkId} className="border-b border-grey-mid last:border-b-0 text-white">
                        <td className="px-3 py-2 align-middle">{row.clerkId}</td>
                        <td className="px-3 py-2 align-middle">{row.name || '—'}</td>
                        <td className={`px-3 py-2 align-middle uppercase ${STATUS_CLASS[row.status]}`}>{row.status}</td>
                        <td className="px-3 py-2 align-middle min-w-[12rem]">
                          {row.status === 'LINKED' ? (
                            <span className="uppercase">{row.staffName?.trim() || 'LINKED STAFF'}</span>
                          ) : (
                            <Select
                              aria-label={`STAFF FOR CLERK ${row.clerkId}`}
                              value={selected[row.clerkId] ?? ''}
                              onChange={(e) => setSelected({ ...selected, [row.clerkId]: e.target.value })}
                              options={staffOptions}
                              placeholder="CHOOSE STAFF"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {row.status !== 'LINKED' ? (
                            <Input
                              aria-label={`PIN FOR CLERK ${row.clerkId}`}
                              value={pin}
                              onChange={(e) => setPins({ ...pins, [row.clerkId]: e.target.value })}
                              maxLength={4}
                              inputMode="numeric"
                              className="w-20"
                            />
                          ) : (
                            <span className="text-grey-mid">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex flex-wrap items-center gap-2">
                            {row.status === 'LINKED' ? (
                              <Button
                                size="sm"
                                variant="danger"
                                aria-label={`UNLINK CLERK ${row.clerkId}`}
                                onClick={() => act(row, 'UNLINK')}
                                loading={rowBusy}
                              >
                                UNLINK
                              </Button>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`LINK CLERK ${row.clerkId}`}
                                  disabled={!selected[row.clerkId]}
                                  onClick={() => act(row, 'LINK')}
                                  loading={rowBusy}
                                >
                                  LINK
                                </Button>
                                <Button
                                  size="sm"
                                  aria-label={`CREATE STAFF FOR CLERK ${row.clerkId}`}
                                  disabled={!validClerkPin(pin)}
                                  title={validClerkPin(pin) ? undefined : 'PIN MUST BE 1–4 DIGITS'}
                                  onClick={() => act(row, 'CREATE')}
                                  loading={rowBusy}
                                >
                                  CREATE
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="font-mono text-2xs uppercase text-grey-light leading-tight">
            CREATING A PROFILE MAKES A FLOOR-STAFF MEMBER IN THIS VENUE AND USES THE CLERK NUMBER AS THE
            1–4 DIGIT WORKER PIN. THE PIN CAN BE CHANGED LATER. UNLINKING KEEPS THE STAFF PROFILE.
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-2xs uppercase text-grey-light mb-0.5">{label}</div>
      <div className="font-mono text-sm text-white">{value}</div>
    </div>
  )
}
