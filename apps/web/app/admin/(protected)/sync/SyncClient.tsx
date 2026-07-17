'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { pushToast } from '@/components/ui/Toast'

interface SyncLogRow {
  id: string
  direction: 'PULL' | 'PUSH' | 'WEBHOOK'
  entity: 'PRODUCT' | 'ORDER'
  status: 'SUCCESS' | 'ERROR' | 'SKIPPED'
  externalId: string | null
  message: string
  detail: unknown
  createdAt: string
}

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: 'text-success border-success',
  ERROR: 'text-danger border-danger',
  SKIPPED: 'text-grey-light border-grey-mid',
}

const DIRECTION_LABELS: Record<string, string> = {
  PULL: 'PULL ←WOO',
  PUSH: 'PUSH →WOO',
  WEBHOOK: 'WEBHOOK ←WOO',
}

const REFRESH_MS = 10_000

export function SyncClient() {
  const [logs, setLogs] = useState<SyncLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [pullingOrders, setPullingOrders] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [directionFilter, setDirectionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (directionFilter) params.set('direction', directionFilter)
    if (statusFilter) params.set('status', statusFilter)
    const r = await fetch(`/api/admin/sync/log?${params.toString()}`)
    if (r.ok) {
      const data = await r.json()
      setLogs(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [directionFilter, statusFilter])

  useEffect(() => {
    setLoading(true)
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  async function handlePull() {
    setPulling(true)
    try {
      const r = await fetch('/api/admin/sync/pull', { method: 'POST' })
      const d = await r.json()
      if (r.ok) {
        pushToast(String(d.message ?? 'PULL COMPLETE').toUpperCase(), 'success')
      } else {
        pushToast(String(d.error ?? 'PULL FAILED').toUpperCase(), 'error')
      }
    } catch {
      pushToast('PULL FAILED', 'error')
    }
    setPulling(false)
    load()
  }

  async function handlePullOrders() {
    setPullingOrders(true)
    try {
      const r = await fetch('/api/admin/sync/pull-orders', { method: 'POST' })
      const d = await r.json()
      if (r.ok) {
        pushToast(String(d.message ?? 'ORDER PULL COMPLETE').toUpperCase(), 'success')
      } else {
        pushToast(String(d.error ?? 'ORDER PULL FAILED').toUpperCase(), 'error')
      }
    } catch {
      pushToast('ORDER PULL FAILED', 'error')
    }
    setPullingOrders(false)
    load()
  }

  async function handlePush() {
    setPushing(true)
    try {
      const r = await fetch('/api/admin/sync/push', { method: 'POST' })
      const d = await r.json()
      if (r.ok) {
        pushToast(String(d.message ?? 'PUSH COMPLETE').toUpperCase(), 'success')
      } else {
        pushToast(String(d.error ?? 'PUSH FAILED').toUpperCase(), 'error')
      }
    } catch {
      pushToast('PUSH FAILED', 'error')
    }
    setPushing(false)
    load()
  }

  const errorCount = logs.filter((l) => l.status === 'ERROR').length

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">WOOCOMMERCE SYNC</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handlePull} disabled={pulling || pushing || pullingOrders}>
            {pulling ? 'PULLING...' : '↓ PULL PRODUCTS NOW'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handlePullOrders} disabled={pulling || pushing || pullingOrders}>
            {pullingOrders ? 'PULLING...' : '↓ PULL ORDERS NOW'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handlePush} disabled={pulling || pushing || pullingOrders}>
            {pushing ? 'PUSHING...' : '↑ PUSH PRODUCTS NOW'}
          </Button>
        </div>
      </div>

      <div className="border border-grey-mid p-3 flex items-center gap-4 flex-wrap">
        <span className="font-mono text-xs uppercase text-grey-light tracking-wider">FILTER</span>
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value)}
          className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white uppercase"
        >
          <option value="">ALL DIRECTIONS</option>
          <option value="PULL">PULL (WOO → APP)</option>
          <option value="PUSH">PUSH (APP → WOO)</option>
          <option value="WEBHOOK">WEBHOOK (WOO → APP)</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white uppercase"
        >
          <option value="">ALL STATUSES</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="ERROR">ERROR</option>
          <option value="SKIPPED">SKIPPED</option>
        </select>
        <span className="font-mono text-xs text-grey-light ml-auto">
          {logs.length} EVENTS{errorCount > 0 && <span className="text-danger"> · {errorCount} ERRORS</span>} · AUTO-REFRESH 10S
        </span>
      </div>

      <div className="border border-grey-mid">
        {logs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-mono text-xs text-grey-light uppercase">NO SYNC ACTIVITY YET</p>
            <p className="font-mono text-[10px] text-grey-light mt-1">
              EVENTS APPEAR HERE WHEN PRODUCTS OR ORDERS SYNC WITH WOOCOMMERCE
            </p>
          </div>
        ) : (
          <div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 border-b border-grey-mid bg-grey-dark/30 font-mono text-[10px] uppercase text-grey-light">
              <div className="col-span-2">TIME</div>
              <div className="col-span-2">DIRECTION</div>
              <div className="col-span-1">ENTITY</div>
              <div className="col-span-1">STATUS</div>
              <div className="col-span-6">MESSAGE</div>
            </div>
            {logs.map((l) => {
              const expanded = expandedId === l.id
              return (
                <div key={l.id} className="border-b border-grey-mid last:border-0">
                  <button
                    onClick={() => setExpandedId(expanded ? null : l.id)}
                    className="w-full grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-2 items-center font-mono text-left hover:bg-grey-mid/10"
                  >
                    <div className="md:col-span-2 flex items-center gap-2">
                      <span className={`text-[10px] ${expanded ? 'text-white' : 'text-grey-light'}`}>{expanded ? '▾' : '▸'}</span>
                      <span className="text-[10px] text-grey-light">{new Date(l.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-[10px] text-white uppercase">{DIRECTION_LABELS[l.direction] ?? l.direction}</span>
                    </div>
                    <div className="md:col-span-1">
                      <span className="text-[10px] text-grey-light uppercase">{l.entity}</span>
                    </div>
                    <div className="md:col-span-1">
                      <span className={`text-[10px] uppercase border px-1.5 py-0.5 ${STATUS_STYLES[l.status] ?? ''}`}>
                        {l.status}
                      </span>
                    </div>
                    <div className="md:col-span-6">
                      <span className={`text-xs ${l.status === 'ERROR' ? 'text-danger' : 'text-white'}`}>{l.message}</span>
                    </div>
                  </button>

                  {/* Expanded: full event detail */}
                  {expanded && (
                    <div className="border-t border-grey-mid bg-grey-dark/40 px-6 py-3 space-y-2">
                      <div className="flex flex-wrap gap-6 font-mono text-[10px] text-grey-light uppercase">
                        <span>EXTERNAL ID: {l.externalId ?? '—'}</span>
                        <span>EVENT ID: {l.id}</span>
                        <span>{new Date(l.createdAt).toLocaleString()}</span>
                      </div>
                      {l.detail != null ? (
                        <pre className="font-mono text-[10px] text-white whitespace-pre-wrap break-all bg-black border border-grey-mid p-3 max-h-64 overflow-y-auto">
                          {JSON.stringify(l.detail, null, 2)}
                        </pre>
                      ) : (
                        <p className="font-mono text-[10px] text-grey-light uppercase">NO ADDITIONAL DETAIL RECORDED FOR THIS EVENT</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
