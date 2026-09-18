'use client'

// The customer's read-only BEO view + approve / sign-off / request-an-edit.
// Public: the opaque token in the URL is the only credential.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { blockDef } from '@/lib/beo-blocks'
import type { PublicEventBlock, PublicEventView } from '@/lib/event-share'

const inputClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function BlockView({
  block,
  menuItems,
}: {
  block: PublicEventBlock
  menuItems: { id: string; name: string }[]
}) {
  const def = blockDef(block.type)
  const label = block.title?.trim() || def?.label || block.type
  const cfg = block.config ?? {}
  const nameOf = (id: string) => menuItems.find((m) => m.id === id)?.name ?? 'ITEM'

  const rows = Array.isArray(cfg.rows) ? (cfg.rows as Record<string, unknown>[]) : null
  const items = Array.isArray(cfg.items)
    ? (cfg.items as { menuItemId: string; qty: number }[])
    : null

  // Scalar text fields (excluding the list-shaped ones).
  const scalars = Object.entries(cfg).filter(
    ([key, v]) => key !== 'rows' && key !== 'items' && typeof v === 'string' && v.trim(),
  )

  const fieldLabel = (key: string) => def?.fields.find((f) => f.key === key)?.label ?? key

  return (
    <div className="border border-grey-mid p-4 space-y-2">
      <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">{label}</h3>

      {scalars.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <span className="font-mono text-[10px] uppercase text-grey-light w-28 shrink-0">{fieldLabel(key)}</span>
          <span className="font-mono text-xs text-white whitespace-pre-wrap">{String(value)}</span>
        </div>
      ))}

      {items && items.length > 0 && (
        <div className="space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between gap-2 font-mono text-xs">
              <span className="text-white">{nameOf(it.menuItemId)}</span>
              <span className="text-grey-light">× {it.qty}</span>
            </div>
          ))}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="divide-y divide-grey-mid border border-grey-mid">
          {rows.map((row, i) => (
            <div key={i} className="px-2 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {Object.entries(row)
                .filter(([, v]) => String(v ?? '').trim() !== '')
                .map(([k, v]) => (
                  <span key={k} className="font-mono text-xs text-white">
                    {k === 'count' ? `× ${String(v)}` : String(v)}
                  </span>
                ))}
            </div>
          ))}
        </div>
      )}

      {scalars.length === 0 && (!items || items.length === 0) && (!rows || rows.length === 0) && (
        <p className="font-mono text-[10px] uppercase text-grey-light">NOTHING SET YET.</p>
      )}
    </div>
  )
}

export function EventShareClient({ token }: { token: string }) {
  const [view, setView] = useState<PublicEventView | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [blockId, setBlockId] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/public/events/${token}`)
      if (!r.ok) { setNotFound(true); setLoading(false); return }
      const d = (await r.json()) as PublicEventView
      setView(d)
      // Prefill the name once; never clobber what the customer typed.
      setName((prev) => prev || d.contactName || '')
    } catch {
      setNotFound(true)
    }
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  async function submit(kind: 'EDIT' | 'APPROVAL' | 'SIGN_OFF') {
    if (kind === 'EDIT' && !message.trim()) {
      setError('PLEASE DESCRIBE THE CHANGE YOU NEED')
      return
    }
    setSending(true)
    setError('')
    setSent('')
    const r = await fetch(`/api/public/events/${token}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, message, blockId: blockId || null, requestedByName: name }),
    })
    setSending(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT SEND')
      return
    }
    setMessage('')
    setSent(kind === 'EDIT' ? 'REQUEST SENT — THE VENUE WILL BE IN TOUCH' : 'THANK YOU — THE VENUE WILL CONFIRM')
    load()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  if (notFound || !view) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm border border-grey-mid p-6 text-center space-y-2">
          <p className="font-mono text-sm font-bold uppercase text-white">LINK NOT AVAILABLE</p>
          <p className="font-mono text-xs text-grey-light">
            THIS LINK HAS BEEN DISABLED, EXPIRED, OR NEVER EXISTED.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-3xl mx-auto p-4 md:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
        <div className="border border-grey-mid p-4 space-y-1">
          <p className="font-mono text-[10px] uppercase text-grey-light tracking-widest">{view.venueName}</p>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">{view.name}</h1>
          <p className="font-mono text-xs uppercase text-grey-light">
            {view.eventDate}
            {view.startTime ? ` · ${view.startTime}` : ''}
            {view.endTime ? `–${view.endTime}` : ''}
            {view.guestCount ? ` · ${view.guestCount} GUESTS` : ''}
            {view.diningStyle ? ` · ${view.diningStyle}` : ''}
          </p>
          <p className="font-mono text-[10px] uppercase text-grey-light">
            STATUS: {view.status}
            {view.menuName ? ` · MENU: ${view.menuName}` : ''}
            {view.setupName ? ` · LAYOUT: ${view.setupName}` : ''}
          </p>
        </div>

        {view.approvedAt && (
          <div className="border border-success p-3">
            <p className="font-mono text-xs uppercase text-success">
              APPROVED{view.approvedByName ? ` BY ${view.approvedByName}` : ''} · {view.approvedAt.slice(0, 10)}
            </p>
          </div>
        )}

        {view.blocks.map((b) => (
          <BlockView key={b.id} block={b} menuItems={view.menuItems} />
        ))}

        <div className="border border-grey-mid p-4 grid grid-cols-3 gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase text-grey-light mb-0.5">SUBTOTAL</div>
            <div className="font-mono text-sm text-white">{money(view.totals.subtotal)}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase text-grey-light mb-0.5">DEPOSIT</div>
            <div className="font-mono text-sm text-white">{money(view.totals.deposit)}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase text-grey-light mb-0.5">BALANCE</div>
            <div className={`font-mono text-sm ${view.totals.balance <= 0 ? 'text-success' : 'text-white'}`}>
              {money(view.totals.balance)}
            </div>
          </div>
        </div>

        {view.totals.lines.length > 0 && (
          <div className="border border-grey-mid p-4 space-y-1">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">ORDER SUMMARY</h3>
            {view.totals.lines.map((l) => (
              <div key={l.menuItemId} className="flex justify-between gap-2 font-mono text-xs">
                <span className="text-white">{l.name} <span className="text-grey-light">× {l.qty}</span></span>
                <span className="text-white">{money(l.total)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Requests */}
        <div className="border border-grey-mid p-4 space-y-3">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">REQUESTS & APPROVALS</h3>

          {view.requests.length === 0 && (
            <p className="font-mono text-[10px] uppercase text-grey-light">NOTHING SENT YET.</p>
          )}
          {view.requests.map((r) => (
            <div key={r.id} className="border border-grey-mid p-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase text-accent border border-accent px-1">{r.kind}</span>
                <span className="font-mono text-[9px] uppercase text-grey-light border border-grey-mid px-1">{r.status}</span>
                <span className="font-mono text-[9px] uppercase text-grey-light ml-auto">{r.createdAt.slice(0, 10)}</span>
              </div>
              <p className="font-mono text-xs text-white whitespace-pre-wrap">{r.message}</p>
              {r.responseNote && (
                <p className="font-mono text-[10px] uppercase text-grey-light">VENUE: {r.responseNote}</p>
              )}
            </div>
          ))}

          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <Button size="md" onClick={() => submit('APPROVAL')} loading={sending} className="justify-center">APPROVE</Button>
              <Button size="md" variant="ghost" onClick={() => submit('SIGN_OFF')} loading={sending} className="justify-center">SIGN OFF</Button>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase text-grey-light mb-1">Your name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="JANE SMITH" />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-grey-light mb-1">Request a change</label>
              <textarea
                value={message}
                rows={3}
                onChange={(e) => setMessage(e.target.value)}
                className={`${inputClass} resize-y`}
                placeholder="COULD WE ADD TWO MORE VEGETARIAN MAINS?"
              />
            </div>
            <div className="space-y-2">
              <select value={blockId} onChange={(e) => setBlockId(e.target.value)} className={inputClass}>
                <option value="">WHOLE EVENT</option>
                {view.blocks.map((b) => (
                  <option key={b.id} value={b.id}>{b.title?.trim() || blockDef(b.type)?.label || b.type}</option>
                ))}
              </select>
              <Button size="md" variant="ghost" onClick={() => submit('EDIT')} loading={sending} className="w-full justify-center">
                SEND REQUEST
              </Button>
            </div>
            {error && <p className="font-mono text-[10px] uppercase text-danger">{error}</p>}
            {sent && <p className="font-mono text-[10px] uppercase text-success">{sent}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
