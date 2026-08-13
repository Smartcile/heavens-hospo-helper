'use client'

import { useCallback, useEffect, useState } from 'react'
import { getActiveVenueId } from '@/lib/active-venue'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'

interface AlertsClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

interface HsAlert {
  id: string
  venueId: string
  taskId: string | null
  deliveryItemId: string | null
  severity: string
  kind: string
  message: string
  value: number | null
  status: string
  resolutionNote: string | null
  createdAt: string
  resolvedAt: string | null
  task: { id: string; title: string } | null
  deliveryItem: { id: string; itemName: string; temp: number | null } | null
  resolvedBy: { id: string; firstName: string; lastName: string } | null
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function AlertsClient({ role, sessionVenueId, defaultVenueId }: AlertsClientProps) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [alerts, setAlerts] = useState<HsAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('OPEN')
  const [severity, setSeverity] = useState('ALL')
  const [kind, setKind] = useState('ALL')
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState({ severity: 'WARNING', kind: 'OUT_OF_RANGE', message: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    const params = new URLSearchParams({ venueId, status })
    if (severity !== 'ALL') params.set('severity', severity)
    if (kind !== 'ALL') params.set('kind', kind)
    const r = await fetch(`/api/admin/hs-alerts?${params}`)
    if (r.ok) setAlerts(await r.json())
    setLoading(false)
  }, [venueId, status, severity, kind])

  useEffect(() => { load() }, [load])

  const resolve = async (a: HsAlert) => {
    const note = window.prompt('RESOLUTION NOTE (OPTIONAL):') ?? ''
    await fetch(`/api/admin/hs-alerts/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', note: note.trim() || null }),
    })
    load()
  }

  const remove = async (a: HsAlert) => {
    if (!window.confirm('DELETE THIS ALERT?')) return
    await fetch(`/api/admin/hs-alerts/${a.id}`, { method: 'DELETE' })
    load()
  }

  const raiseManual = async () => {
    if (!venueId || !manual.message.trim()) return
    setSaving(true)
    setError('')
    const r = await fetch('/api/admin/hs-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, ...manual, message: manual.message.trim() }),
    })
    if (!r.ok) {
      setError('RAISE FAILED')
      setSaving(false)
      return
    }
    setManualOpen(false)
    setManual({ severity: 'WARNING', kind: 'OUT_OF_RANGE', message: '' })
    setSaving(false)
    setStatus('OPEN')
    load()
  }

  const open = alerts.filter((a) => a.status === 'OPEN').length

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">ALERTS</h1>
          <p className="font-mono text-xs text-grey-light mt-0.5">{open} OPEN — OUT OF RANGE READINGS, FAILED DELIVERIES</p>
        </div>
        <Button size="sm" onClick={() => { setManualOpen(true); setError('') }}>+ RAISE ALERT</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-40">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'OPEN', label: 'OPEN' },
              { value: 'RESOLVED', label: 'RESOLVED' },
              { value: 'ALL', label: 'ALL' },
            ]}
          />
        </div>
        <div className="w-40">
          <Select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            options={[
              { value: 'ALL', label: 'ALL SEVERITY' },
              { value: 'WARNING', label: 'WARNING' },
              { value: 'CRITICAL', label: 'CRITICAL' },
            ]}
          />
        </div>
        <div className="w-44">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={[
              { value: 'ALL', label: 'ALL KINDS' },
              { value: 'OUT_OF_RANGE', label: 'OUT OF RANGE' },
              { value: 'DELIVERY_TEMP', label: 'DELIVERY TEMP' },
            ]}
          />
        </div>
      </div>

      {loading && <p className="font-mono text-xs text-grey-light py-8 text-center">LOADING…</p>}
      {!loading && !venueId && <p className="font-mono text-xs text-danger py-8 text-center">SELECT A VENUE IN THE SIDEBAR</p>}

      <div className="space-y-2">
        {!loading && alerts.length === 0 && (
          <div className="border border-grey-mid p-8 text-center font-mono text-xs text-grey-light">NO {status} ALERTS</div>
        )}
        {alerts.map((a) => (
          <div key={a.id} className={cn('border p-3 flex items-start gap-3', a.status === 'RESOLVED' && 'opacity-50')}>
            <div className={cn('w-1 self-stretch shrink-0', a.severity === 'CRITICAL' ? 'bg-danger' : 'bg-[#FACC15]')} />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('font-mono text-[10px] border px-1.5 py-0.5', a.severity === 'CRITICAL' ? 'text-danger border-danger/50' : 'text-[#FACC15] border-[#FACC15]/50')}>
                  {a.severity}
                </span>
                <span className="font-mono text-[10px] text-grey-light border border-grey-mid px-1.5 py-0.5">{a.kind}</span>
                <span className="font-mono text-[10px] text-grey-light">{fmtDate(a.createdAt)}</span>
                {a.value != null && <span className="font-mono text-[10px] text-white">{a.value}°C</span>}
                {a.task && (
                  <a href="/admin/compliance?tab=tasks" className="font-mono text-[10px] text-grey-light hover:text-white underline">
                    TASK: {a.task.title}
                  </a>
                )}
                {a.deliveryItem && (
                  <span className="font-mono text-[10px] text-grey-light">DELIVERY: {a.deliveryItem.itemName}</span>
                )}
                {a.status === 'RESOLVED' && a.resolvedBy && (
                  <span className="font-mono text-[10px] text-success">
                    RESOLVED {a.resolvedAt ? fmtDate(a.resolvedAt) : ''} BY {a.resolvedBy.firstName} {a.resolvedBy.lastName}
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-white">{a.message}</p>
              {a.resolutionNote && <p className="font-mono text-[10px] text-grey-light">NOTE: {a.resolutionNote}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {a.status === 'OPEN' && (
                <Button size="sm" variant="ghost" onClick={() => resolve(a)}>RESOLVE</Button>
              )}
              <Button size="sm" variant="danger" onClick={() => remove(a)}>DEL</Button>
            </div>
          </div>
        ))}
      </div>

      {/* Manual raise modal */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setManualOpen(false)}>
          <div className="border border-grey-mid bg-grey-dark w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-lg font-bold uppercase tracking-widest">RAISE ALERT</h2>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="SEVERITY"
                value={manual.severity}
                onChange={(e) => setManual({ ...manual, severity: e.target.value })}
                options={[
                  { value: 'WARNING', label: 'WARNING' },
                  { value: 'CRITICAL', label: 'CRITICAL' },
                ]}
              />
              <Select
                label="KIND"
                value={manual.kind}
                onChange={(e) => setManual({ ...manual, kind: e.target.value })}
                options={[
                  { value: 'OUT_OF_RANGE', label: 'OUT OF RANGE' },
                  { value: 'DELIVERY_TEMP', label: 'DELIVERY TEMP' },
                  { value: 'MAINTENANCE_DUE', label: 'MAINTENANCE DUE' },
                  { value: 'SENSOR_OFFLINE', label: 'SENSOR OFFLINE' },
                ]}
              />
            </div>
            <Input label="MESSAGE" value={manual.message} onChange={(e) => setManual({ ...manual, message: e.target.value })} />
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
            <div className="border-t border-grey-mid pt-3 flex items-center gap-2 justify-end">
              <Button variant="ghost" onClick={() => setManualOpen(false)}>CANCEL</Button>
              <Button onClick={raiseManual} loading={saving}>RAISE ALERT</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
