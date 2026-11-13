'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { GiftCardPdfView } from '@/components/worker/GiftCardPdfView'
import { remainingBalance } from '@/lib/gift-card-redemption'
import { formatDateDMY, localDayKey } from '@/lib/date-nav'

// Worker gift cards — a phone-first workflow for the floor:
//   1. Look up ANY card by number, customer name or email
//   2. See its amount and remaining balance, then redeem part or all of it
//   3. Sell a card from the next premade draft, or PICK a specific draft
//   4. Managers/admins can reset a card back to a blank DRAFT with the SAME
//      number and full history (reuse), never hard-deleting anything.
// Access: PERFORMANCE → GIFT CARDS → ISSUE on the Staff ACCESS screen.

interface CardSummary {
  id: string
  number: string
  amount: number
  redeemedAmount?: number | null
  status: string
  customerName: string | null
  customerEmail: string | null
  message: string | null
  issuedAt: string | null
  expiresAt: string | null
  redeemedAt: string | null
  createdAt: string
}

interface HistoryEvent {
  at: string
  type: string
  note: string
}

interface CardDetail extends CardSummary {
  history: HistoryEvent[]
  pdfPath?: string | null
  notes?: string | null
  sentAt?: string | null
}

interface ModuleState {
  allowed: boolean | null
  canManage: boolean
  draft: { id: string; number: string } | null
  nextNumber: string | null
  poolFull: boolean
  error: string
}

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'text-grey-light border-grey-mid',
  ISSUED: 'text-info border-info',
  SENT: 'text-warning border-warning',
  REDEEMED: 'text-success border-success',
  VOIDED: 'text-danger border-danger',
  EXPIRED: 'text-danger border-danger',
}

function money(value: number): string {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : formatDateDMY(localDayKey(d))
}

export function WorkerGiftCardsClient() {
  const [state, setState] = useState<ModuleState>({
    allowed: null,
    canManage: false,
    draft: null,
    nextNumber: null,
    poolFull: false,
    error: '',
  })

  const [search, setSearch] = useState('')
  const [results, setResults] = useState<CardSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const searchSeq = useRef(0)

  const [selected, setSelected] = useState<CardDetail | null>(null)
  const [loadingCard, setLoadingCard] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [redeemAmount, setRedeemAmount] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')

  const [drafts, setDrafts] = useState<CardSummary[]>([])
  const [showDrafts, setShowDrafts] = useState(false)
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [chosen, setChosen] = useState<CardSummary | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [done, setDone] = useState<{ cardId: string; number: string; amount: number } | null>(null)
  const [viewing, setViewing] = useState<{ cardId: string; number: string } | null>(null)

  const loadModule = useCallback(async () => {
    try {
      const r = await fetch('/api/worker/giftcards')
      if (r.status === 403) {
        setState((s) => ({ ...s, allowed: false }))
        return
      }
      if (!r.ok) {
        setState((s) => ({ ...s, allowed: false }))
        return
      }
      const d = await r.json()
      setState({
        allowed: true,
        canManage: !!d.canManage,
        draft: d.draft ?? null,
        nextNumber: d.nextNumber ?? null,
        poolFull: !!d.poolFull,
        error: '',
      })
    } catch {
      setState((s) => ({ ...s, allowed: false }))
    }
  }, [])

  useEffect(() => {
    loadModule()
  }, [loadModule])

  // Live search (debounced) across card number, customer name and email.
  useEffect(() => {
    const q = search.trim()
    if (!q) {
      setResults([])
      setSearchError('')
      setSearching(false)
      return
    }
    const seq = ++searchSeq.current
    setSearching(true)
    setSearchError('')
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/worker/giftcards?search=${encodeURIComponent(q)}`)
        if (seq !== searchSeq.current) return
        if (r.ok) {
          const d = await r.json()
          setResults(Array.isArray(d.cards) ? d.cards : [])
        } else {
          const d = await r.json().catch(() => null)
          setResults([])
          setSearchError(d?.error ?? 'SEARCH FAILED')
        }
      } catch {
        if (seq === searchSeq.current) setSearchError('SEARCH FAILED')
      } finally {
        if (seq === searchSeq.current) setSearching(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  async function openCard(id: string) {
    setLoadingCard(true)
    setDetailError('')
    setActionMessage('')
    setActionError('')
    setRedeemAmount('')
    try {
      const r = await fetch(`/api/worker/giftcards/${id}`)
      const d = await r.json().catch(() => null)
      if (r.ok && d?.card) {
        setSelected(d.card as CardDetail)
      } else {
        setDetailError(d?.error ?? 'COULD NOT LOAD THIS CARD')
      }
    } catch {
      setDetailError('COULD NOT LOAD THIS CARD')
    } finally {
      setLoadingCard(false)
    }
  }

  async function redeem(valueOverride?: number) {
    if (!selected) return
    const value = valueOverride ?? parseFloat(redeemAmount)
    if (!value || value <= 0) {
      setActionError('ENTER A REDEEM AMOUNT')
      return
    }
    setRedeeming(true)
    setActionError('')
    setActionMessage('')
    try {
      const r = await fetch(`/api/worker/giftcards/${selected.id}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: value }),
      })
      const d = await r.json().catch(() => null)
      if (r.ok && d?.card) {
        setSelected(d.card as CardDetail)
        setRedeemAmount('')
        setActionMessage(
          d.card.status === 'REDEEMED'
            ? 'CARD FULLY REDEEMED — NO BALANCE LEFT'
            : `REDEEMED ${money(value)} — ${money(d.balance)} REMAINING`,
        )
        setResults((rows) => rows.map((row) => (row.id === d.card.id ? { ...row, ...d.card } : row)))
      } else {
        setActionError(d?.error ?? 'REDEEM FAILED')
      }
    } catch {
      setActionError('COULD NOT CONNECT')
    } finally {
      setRedeeming(false)
    }
  }

  async function resetCard() {
    if (!selected) return
    if (!window.confirm(`RESET CARD #${selected.number} TO A BLANK DRAFT?\n\nIT CAN BE SOLD AGAIN WITH THE SAME NUMBER. THE FULL HISTORY IS KEPT.`)) return
    setRedeeming(true)
    setActionError('')
    setActionMessage('')
    try {
      const r = await fetch(`/api/worker/giftcards/${selected.id}/reset`, { method: 'POST' })
      const d = await r.json().catch(() => null)
      if (r.ok && d?.id) {
        setSelected(d as CardDetail)
        setActionMessage('RESET TO DRAFT — SAME NUMBER, HISTORY KEPT')
        setSearch('')
        loadModule()
      } else {
        setActionError(d?.error ?? 'RESET FAILED')
      }
    } catch {
      setActionError('COULD NOT CONNECT')
    } finally {
      setRedeeming(false)
    }
  }

  async function toggleDrafts() {
    if (showDrafts) {
      setShowDrafts(false)
      return
    }
    setShowDrafts(true)
    setLoadingDrafts(true)
    try {
      const r = await fetch('/api/worker/giftcards?status=DRAFT&list=1')
      const d = await r.json().catch(() => null)
      setDrafts(r.ok && Array.isArray(d?.cards) ? d.cards : [])
    } catch {
      setDrafts([])
    } finally {
      setLoadingDrafts(false)
    }
  }

  async function issue() {
    const value = parseFloat(amount)
    if (!value || value <= 0) {
      setState((s) => ({ ...s, error: 'ENTER AN AMOUNT' }))
      return
    }
    setState((s) => ({ ...s, error: '' }))
    setIssuing(true)
    const r = await fetch('/api/worker/giftcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(chosen ? { cardId: chosen.id } : {}),
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
      setChosen(null)
      setShowDrafts(false)
      loadModule()
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
          <p className="font-mono text-xs text-grey-light leading-relaxed">
            THIS MODULE IS LOCKED. ASK A MANAGER TO GRANT IT IN STAFF → ACCESS → PERFORMANCE → GIFT CARDS → ISSUE.
          </p>
        </div>
      </div>
    )
  }

  if (viewing) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <GiftCardPdfView
          cardId={viewing.cardId}
          number={viewing.number}
          onBack={() => setViewing(null)}
        />
      </div>
    )
  }

  if (selected) {
    const balance = remainingBalance(selected)
    const canRedeem = selected.status === 'ISSUED' || selected.status === 'SENT'
    const canReset = state.canManage && ['ISSUED', 'SENT', 'VOIDED'].includes(selected.status)
    const history = [...(selected.history ?? [])].sort((a, b) => (a.at < b.at ? 1 : -1))
    return (
      <div className="min-h-screen bg-black px-4 pt-4 pb-28">
        <div className="mx-auto w-full max-w-md space-y-4">
          <button
            onClick={() => setSelected(null)}
            className="font-mono text-xs uppercase text-white border border-grey-mid px-3 py-3 hover:border-white"
          >
            ← BACK
          </button>

          <div className="border border-grey-mid p-4 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xl text-white">{selected.number}</span>
              <span className={`font-mono text-xs uppercase border px-2 py-0.5 ${STATUS_CLASSES[selected.status] ?? 'text-grey-light border-grey-mid'}`}>
                {selected.status}
              </span>
            </div>
            <p className="font-mono text-xs uppercase text-grey-light">REMAINING BALANCE</p>
            <p className="font-mono text-4xl text-white">{money(balance)}</p>
            <p className="font-mono text-xs text-grey-light">OF {money(selected.amount)} · REDEEMED {money(selected.redeemedAmount ?? 0)}</p>
          </div>

          <div className="border border-grey-mid p-4 space-y-2">
            <p className="font-mono text-xs uppercase text-grey-light tracking-wider">CARD DETAILS</p>
            <DetailRow label="ISSUED" value={fmtDate(selected.issuedAt)} />
            <DetailRow label="EXPIRES" value={fmtDate(selected.expiresAt)} />
            <DetailRow label="CUSTOMER" value={selected.customerName || '—'} />
            <DetailRow label="EMAIL" value={selected.customerEmail || '—'} />
            <DetailRow label="MESSAGE" value={selected.message || '—'} />
          </div>

          {canRedeem && (
            <div className="border border-grey-mid p-4 space-y-3">
              <p className="font-mono text-xs uppercase text-grey-light tracking-wider">REDEEM THIS CARD</p>
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">AMOUNT TO REDEEM ($)</label>
                <Input
                  type="number"
                  value={redeemAmount}
                  onChange={(e) => setRedeemAmount(e.target.value)}
                  placeholder="REDEEM AMOUNT"
                  className="text-right py-3"
                  inputMode="decimal"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" className="w-full py-3" onClick={() => redeem(balance)} disabled={redeeming || balance <= 0}>
                  FULL BALANCE
                </Button>
                <Button className="w-full py-3" onClick={() => redeem()} disabled={redeeming}>
                  {redeeming ? 'REDEEMING...' : 'REDEEM'}
                </Button>
              </div>
            </div>
          )}

          {actionMessage && <p className="font-mono text-xs text-success">{actionMessage}</p>}
          {actionError && <p className="font-mono text-xs text-danger">{actionError}</p>}

          {selected.pdfPath && (
            <Button
              variant="ghost"
              className="w-full py-3"
              onClick={() => setViewing({ cardId: selected.id, number: selected.number })}
            >
              VIEW / PRINT PDF
            </Button>
          )}

          {canReset && (
            <div className="border border-danger/60 p-4 space-y-2">
              <p className="font-mono text-xs uppercase text-danger tracking-wider">REUSE THIS CARD</p>
              <p className="font-mono text-xs text-grey-light leading-relaxed">
                RESET TO A BLANK DRAFT AND SELL IT AGAIN WITH THE SAME NUMBER. CUSTOMER DETAILS, AMOUNT AND PDF ARE
                CLEARED; THE FULL HISTORY IS KEPT.
              </p>
              <Button variant="danger" className="w-full py-3" onClick={resetCard} disabled={redeeming}>
                RESET TO DRAFT (REUSE NUMBER)
              </Button>
            </div>
          )}

          <div className="border border-grey-mid p-4 space-y-2">
            <p className="font-mono text-xs uppercase text-grey-light tracking-wider">HISTORY</p>
            {history.length === 0 && <p className="font-mono text-xs text-grey-light">NO ACTIVITY YET</p>}
            {history.map((h, i) => (
              <div key={`${h.at}-${i}`} className="border-b border-grey-mid/60 pb-1.5 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-grey-light/70">{fmtDate(h.at)}</span>
                  <span className="font-mono text-xs uppercase text-white">{h.type}</span>
                </div>
                <p className="font-sans text-xs text-white/90 break-words">{h.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (loadingCard) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING CARD</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 pb-28">
        <div className="border border-grey-mid p-6 w-full max-w-sm space-y-4">
          <p className="font-mono text-xs uppercase text-success tracking-widest">GIFT CARD ISSUED</p>
          <div className="border border-grey-mid p-4 text-center space-y-1">
            <div className="font-mono text-3xl text-white">{done.number}</div>
            <div className="font-mono text-xl text-white">{money(done.amount)}</div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Button className="w-full py-3" onClick={() => setViewing({ cardId: done.cardId, number: done.number })}>
              VIEW / PRINT PDF
            </Button>
            <Button variant="ghost" className="w-full py-3" onClick={() => setDone(null)}>NEXT CARD</Button>
          </div>
          <p className="font-mono text-xs text-grey-light">PRINT THE PDF ON A CARD PRINTER OR STANDARD PAPER.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black px-4 pt-4 pb-28">
      <div className="mx-auto w-full max-w-md space-y-4">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">GIFT CARDS</h1>

        {/* Look up any card */}
        <div className="border border-grey-mid p-4 space-y-3">
          <p className="font-mono text-xs uppercase text-grey-light tracking-wider">FIND A GIFT CARD</p>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SEARCH NUMBER, NAME OR EMAIL"
            className="py-3"
          />
          {searchError && <p className="font-mono text-xs text-danger">{searchError}</p>}
          {searching && <p className="font-mono text-xs text-grey-light loading-cursor">SEARCHING</p>}
          {!searching && search.trim() !== '' && results.length === 0 && !searchError && (
            <p className="font-mono text-xs text-grey-light">NO CARDS MATCH.</p>
          )}
          {results.length > 0 && (
            <div className="divide-y divide-grey-mid border border-grey-mid">
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openCard(c.id)}
                  className="w-full text-left px-3 py-3 hover:bg-grey-dark/40 space-y-0.5"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-white">{c.number}</span>
                    <span className={`font-mono text-xs uppercase border px-1.5 py-0.5 ${STATUS_CLASSES[c.status] ?? 'text-grey-light border-grey-mid'}`}>
                      {c.status}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-sans text-xs text-grey-light truncate">{c.customerName || c.customerEmail || 'NO CUSTOMER'}</span>
                    <span className="font-mono text-xs text-white shrink-0">{money(remainingBalance(c))}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {detailError && <p className="font-mono text-xs text-danger">{detailError}</p>}

        {/* Issue / sell a card */}
        <div className="border border-grey-mid p-4 space-y-3">
          <p className="font-mono text-xs uppercase text-grey-light tracking-wider">SELL A GIFT CARD</p>

          <div className="border border-grey-mid p-3">
            <p className="font-mono text-xs uppercase text-grey-light">NEXT CARD TO ISSUE</p>
            {chosen ? (
              <p className="font-mono text-2xl text-white">{chosen.number} <span className="font-mono text-xs text-info uppercase">(CHOSEN)</span></p>
            ) : state.draft ? (
              <p className="font-mono text-2xl text-white">{state.draft.number}</p>
            ) : state.poolFull ? (
              <p className="font-mono text-xs text-danger uppercase">NUMBER POOL FULL</p>
            ) : (
              <p className="font-mono text-xs text-grey-light uppercase">NO DRAFTS — ONE WILL BE CREATED (NEXT FREE: {state.nextNumber ?? '—'})</p>
            )}
          </div>

          <Button variant="ghost" className="w-full py-3" onClick={toggleDrafts}>
            {showDrafts ? 'HIDE BLANK CARDS' : 'CHOOSE A BLANK CARD'}
          </Button>

          {showDrafts && (
            <div className="divide-y divide-grey-mid border border-grey-mid">
              {loadingDrafts && <p className="font-mono text-xs text-grey-light px-3 py-2">LOADING</p>}
              {!loadingDrafts && drafts.length === 0 && (
                <p className="font-mono text-xs text-grey-light px-3 py-2">NO BLANK CARDS — ONE WILL BE CREATED WHEN YOU ISSUE.</p>
              )}
              {drafts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setChosen(c); setShowDrafts(false) }}
                  className="w-full text-left px-3 py-3 font-mono text-sm text-white hover:bg-grey-dark/40 flex items-center justify-between"
                >
                  <span>{c.number}</span>
                  {chosen?.id === c.id && <span className="font-mono text-xs uppercase text-info">SELECTED</span>}
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">AMOUNT ($)</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-right py-3" inputMode="decimal" autoFocus />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">CUSTOMER NAME (OPTIONAL)</label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="CUSTOMER NAME" className="py-3" />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">CUSTOMER EMAIL (OPTIONAL)</label>
            <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="email@example.com" className="py-3" />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">MESSAGE (OPTIONAL)</label>
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Something special just for you..." className="py-3" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="bg-grey-dark border border-grey-mid accent-white" />
            <span className="font-mono text-xs uppercase text-grey-light">INTERNAL (PRINT LATER)</span>
          </label>
          {state.error && <p className="font-mono text-xs text-danger">{state.error}</p>}
          <Button className="w-full py-3" onClick={issue} disabled={issuing}>
            {issuing ? 'ISSUING...' : 'ISSUE GIFT CARD'}
          </Button>
        </div>

        <p className="font-mono text-xs text-grey-light leading-relaxed">
          THE PDF IS GENERATED WITH THE VENUE&apos;S ACTIVE TEMPLATE (OR THE BUILT-IN DESIGN) AND CAN BE PRINTED IMMEDIATELY.
        </p>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="font-mono text-xs uppercase text-grey-light shrink-0">{label}</span>
      <span className="font-mono text-xs text-white text-right break-words">{value}</span>
    </div>
  )
}
