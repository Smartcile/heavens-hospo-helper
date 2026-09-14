'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// Worker gift card issuing — a host/supervisor can sell a physical card from
// the phone. Uses the LOWEST-numbered draft (1..100 pool) and prints the PDF.
// Access: PERFORMANCE → GIFT CARDS → ISSUE on the Staff ACCESS screen.

interface ModuleState {
  allowed: boolean | null
  draft: { id: string; number: string } | null
  nextNumber: string | null
  poolFull: boolean
  error: string
}

export function WorkerGiftCardsClient() {
  const [state, setState] = useState<ModuleState>({ allowed: null, draft: null, nextNumber: null, poolFull: false, error: '' })
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [done, setDone] = useState<{ cardId: string; number: string; amount: number } | null>(null)

  useEffect(() => {
    fetch('/api/worker/giftcards')
      .then(async (r) => {
        if (r.status === 403) { setState((s) => ({ ...s, allowed: false })); return null }
        if (!r.ok) return null
        return r.json()
      })
      .then((d) => {
        if (!d) { setState((s) => ({ ...s, allowed: false })); return }
        setState({ allowed: true, draft: d.draft ?? null, nextNumber: d.nextNumber ?? null, poolFull: d.poolFull, error: '' })
      })
      .catch(() => setState((s) => ({ ...s, allowed: false })))
  }, [])

  async function issue() {
    const value = parseFloat(amount)
    if (!value || value <= 0) { setState((s) => ({ ...s, error: 'ENTER AN AMOUNT' })); return }
    setState((s) => ({ ...s, error: '' }))
    setIssuing(true)
    const r = await fetch('/api/worker/giftcards/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: customerName || null,
        customerEmail: customerEmail || null,
        amount: value,
        message: message || null,
        isInternal,
      }),
    })
    setIssuing(false)
    if (r.ok) {
      const d = await r.json()
      setDone({ cardId: d.cardId, number: d.number, amount: d.amount })
      setAmount('')
      setMessage('')
      // Refresh the "next draft" readout.
      fetch('/api/worker/giftcards')
        .then(async (res) => {
          if (!res.ok) return
          const dd = await res.json()
          if (dd?.allowed) {
            setState({ allowed: true, draft: dd.draft ?? null, nextNumber: dd.nextNumber ?? null, poolFull: dd.poolFull, error: '' })
          }
        })
        .catch(() => {})
    } else {
      const d = await r.json().catch(() => null)
      setState((s) => ({ ...s, error: d?.error ?? 'ISSUE FAILED' }))
    }
  }

  if (state.allowed === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }
  if (state.allowed === false) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="border border-grey-mid p-6 max-w-sm text-center space-y-3">
          <p className="font-mono text-sm uppercase tracking-widest text-white">NOT AUTHORISED</p>
          <p className="font-mono text-[10px] text-grey-light leading-relaxed">
            THIS MODULE IS LOCKED. ASK A MANAGER TO GRANT IT IN STAFF → ACCESS → PERFORMANCE → GIFT CARDS → ISSUE.
          </p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="border border-grey-mid p-6 w-full max-w-sm space-y-4">
          <p className="font-mono text-xs uppercase text-success tracking-widest">GIFT CARD ISSUED</p>
          <div className="border border-grey-mid p-4 text-center space-y-1">
            <div className="font-mono text-3xl text-white">{done.number}</div>
            <div className="font-mono text-xl text-white">${done.amount.toFixed(2)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => window.open(`/api/worker/giftcards/${done.cardId}/pdf`, '_blank')}>VIEW / PRINT PDF</Button>
            <Button variant="ghost" onClick={() => setDone(null)}>NEXT CARD</Button>
          </div>
          <p className="font-mono text-[9px] text-grey-light">PRINT THE PDF ON A CARD PRINTER OR STANDARD PAPER.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">GIFT CARDS</h1>

        <div className="border border-grey-mid p-4 space-y-1">
          <p className="font-mono text-[10px] uppercase text-grey-light">NEXT CARD TO ISSUE</p>
          {state.draft ? (
            <p className="font-mono text-2xl text-white">{state.draft.number}</p>
          ) : state.poolFull ? (
            <p className="font-mono text-xs text-danger uppercase">NUMBER POOL FULL — ALL 100 IN USE</p>
          ) : (
            <p className="font-mono text-xs text-grey-light uppercase">NO DRAFTS — ONE WILL BE CREATED (NEXT FREE: {state.nextNumber ?? '—'})</p>
          )}
        </div>

        <div className="border border-grey-mid p-4 space-y-3">
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">AMOUNT ($)</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-right" autoFocus />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">CUSTOMER NAME (OPTIONAL)</label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="CUSTOMER NAME" />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">CUSTOMER EMAIL (OPTIONAL)</label>
            <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="email@example.com" />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">MESSAGE (OPTIONAL)</label>
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Something special just for you..." />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="bg-grey-dark border border-grey-mid accent-white" />
            <span className="font-mono text-[10px] uppercase text-grey-light">INTERNAL (PRINT LATER)</span>
          </label>
          {state.error && <p className="font-mono text-xs text-danger">{state.error}</p>}
          <Button className="w-full" onClick={issue} disabled={issuing}>
            {issuing ? 'ISSUING...' : 'ISSUE GIFT CARD'}
          </Button>
        </div>

        <p className="font-mono text-[9px] text-grey-light leading-relaxed">
          THE PDF IS GENERATED WITH THE VENUE&apos;S ACTIVE TEMPLATE (OR THE BUILT-IN DESIGN) AND CAN BE PRINTED IMMEDIATELY.
        </p>
      </div>
    </div>
  )
}
