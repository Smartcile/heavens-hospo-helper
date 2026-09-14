'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// Gift card popup: click any card in the list. Left = the card itself (edit
// details, status actions, private notes, PDF/email); right = the
// WooCommerce order it came from; bottom feed = what has happened to the
// card in the app AND on the store (SyncLog for the order) so issues can be
// traced end to end.

interface CardOrder {
  id: string
  wooOrderId: string
  orderNumber: string | null
  source: string | null
  status: string | null
  opStatus: string | null
  paymentStatus: string | null
  paymentMethod: string | null
  paidAt: string | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  partySize: number | null
  serviceDate: string | null
  serviceTime: string | null
  totalAmount: number | null
  notes: string | null
  createdAt: string
  syncedAt: string | null
  history: HistoryEvent[]
  items: {
    id: string
    productName: string | null
    qty: number | null
    unitPrice: number | null
    notes: string | null
    customerNote: string | null
    allergenNote: string | null
  }[]
}

interface HistoryEvent {
  at: string
  type: string
  note: string
}

interface SyncFeedEntry {
  id: string
  direction: string
  status: string
  message: string
  createdAt: string
}

interface CardDetail {
  card: {
    id: string
    number: string
    amount: number
    customerName: string | null
    customerEmail: string | null
    message: string | null
    status: string
    isInternal: boolean
    wooOrderId: string | null
    issuedAt: string | null
    sentAt: string | null
    pdfPath: string | null
    notes: string | null
    createdAt: string
    history: HistoryEvent[]
  }
  order: CardOrder | null
  logs: SyncFeedEntry[]
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-grey-light',
  ISSUED: 'text-[#60A5FA]',
  SENT: 'text-[#FACC15]',
  REDEEMED: 'text-success',
  VOIDED: 'text-danger',
  EXPIRED: 'text-danger',
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: 'CARD CREATED',
  DETAILS_UPDATED: 'DETAILS UPDATED',
  ISSUED: 'ISSUED',
  EMAIL_SENT: 'EMAIL SENT',
  STATUS: 'STATUS CHANGED',
  NOTE: 'PRIVATE NOTE',
  AUTO_ISSUED: 'AUTO-ISSUED (WOOCOMMERCE)',
  REDEEMED: 'REDEEMED',
  REPLACED: 'REPLACED (VOIDED)',
  RESET: 'RESET TO DRAFT',
}

// What the APP did to the linked order (WooOrder.history) — the store's own
// activity (syncs/webhooks/pushes) arrives via the SyncLog feed below.
const ORDER_EVENT_LABELS: Record<string, string> = {
  CREATED: 'ORDER CREATED',
  STATUS: 'STATUS CHANGED',
  DETAILS_UPDATED: 'DETAILS UPDATED',
  NOTE: 'NOTE',
  PAYMENT_CONFIRMED: 'PAYMENT CONFIRMED',
  CARD_ISSUED: 'GIFT CARD ISSUED',
  CARD_REPLACED: 'GIFT CARD REPLACED',
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export function GiftCardModal({ cardId, onClose, onChanged }: { cardId: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<CardDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Drafts for the editable fields.
  const [draft, setDraft] = useState({ customerName: '', customerEmail: '', amount: '', message: '', notes: '' })
  const [sendOpen, setSendOpen] = useState(false)
  const [emailDraft, setEmailDraft] = useState({ smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '', smtpFrom: '', subject: '', body: '' })
  // Replacement popup — the new card starts from the old card's details.
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [replaceDraft, setReplaceDraft] = useState({ reason: '', customerName: '', customerEmail: '', amount: '', message: '' })

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/gift-cards/${cardId}/detail`)
    if (!r.ok) { setLoadError('COULD NOT LOAD THIS CARD'); return }
    const d: CardDetail = await r.json()
    setDetail(d)
    setDraft({
      customerName: d.card.customerName ?? '',
      customerEmail: d.card.customerEmail ?? '',
      amount: String(d.card.amount || ''),
      message: d.card.message ?? '',
      notes: d.card.notes ?? '',
    })
  }, [cardId])

  useEffect(() => { load() }, [load])

  const card = detail?.card ?? null
  const order = detail?.order ?? null

  async function saveDetails() {
    if (!card) return
    const amount = parseFloat(draft.amount)
    if (!amount || amount <= 0) { setError('AMOUNT IS REQUIRED'); return }
    setSaving(true); setError(''); setMessage('')
    const r = await fetch(`/api/admin/gift-cards/${card.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: draft.customerName || null,
        customerEmail: draft.customerEmail || null,
        amount,
        message: draft.message || null,
        notes: draft.notes || null,
      }),
    })
    if (r.ok) { setMessage('DETAILS SAVED'); onChanged(); load() }
    else { const e = await r.json().catch(() => null); setError(e?.error ?? 'SAVE FAILED') }
    setSaving(false)
  }

  async function issueCard() {
    if (!card) return
    const amount = parseFloat(draft.amount)
    if (!amount || amount <= 0) { setError('AMOUNT IS REQUIRED BEFORE ISSUING'); return }
    setSaving(true); setError(''); setMessage('')
    const r = await fetch(`/api/admin/gift-cards/${card.id}/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: draft.customerName || null,
        customerEmail: draft.customerEmail || null,
        amount,
        message: draft.message || null,
        isInternal: card.isInternal,
      }),
    })
    if (r.ok) { setMessage('CARD ISSUED — PDF GENERATED'); onChanged(); load() }
    else { const e = await r.json().catch(() => null); setError(e?.error ?? 'ISSUE FAILED') }
    setSaving(false)
  }

  async function setStatus(next: string) {
    if (!card) return
    const note = next === 'VOIDED'
      ? 'VOID THIS CARD? THE VALUE IS PERMANENTLY REMOVED.'
      : next === 'REDEEMED'
        ? 'MARK THIS CARD AS REDEEMED? THE VALUE HAS BEEN USED.'
        : `SET STATUS TO ${next}?`
    if (!window.confirm(note)) return
    setSaving(true); setError(''); setMessage('')
    const r = await fetch(`/api/admin/gift-cards/${card.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (r.ok) { setMessage(`STATUS: ${next}`); onChanged(); load() }
    else { const e = await r.json().catch(() => null); setError(e?.error ?? 'UPDATE FAILED') }
    setSaving(false)
  }

  async function resetCard() {
    if (!card) return
    const warning = card.status === 'VOIDED'
      ? 'RESET THIS CARD TO A BLANK DRAFT?\n\nIT CAN THEN BE SOLD/ISSUED AGAIN WITH THE SAME NUMBER. THE FULL HISTORY IS KEPT.'
      : 'RESET THIS CARD TO A BLANK DRAFT?\n\nAMOUNT, CUSTOMER DETAILS AND THE PDF ARE CLEARED — THE NUMBER STAYS AND THE FULL HISTORY IS KEPT. ONLY DO THIS WHEN THE CARD WAS NEVER HANDED TO THE CUSTOMER.'
    if (!window.confirm(warning)) return
    setSaving(true); setError(''); setMessage('')
    const r = await fetch(`/api/admin/gift-cards/${card.id}/reset`, { method: 'POST' })
    if (r.ok) { setMessage('RESET TO DRAFT — SAME NUMBER, HISTORY KEPT'); onChanged(); load() }
    else { const e = await r.json().catch(() => null); setError(e?.error ?? 'RESET FAILED') }
    setSaving(false)
  }

  async function deleteCard() {
    if (!card) return
    if (!window.confirm(`DELETE CARD #${card.number}?\n\nTHE ROW IS REMOVED AND ITS NUMBER BECOMES AVAILABLE FOR A NEW PREMADE CARD. THE HISTORY IS LOST — ONLY DO THIS FOR VOIDED CARDS THAT MUST NEVER BE USED.`)) return
    setSaving(true); setError(''); setMessage('')
    const r = await fetch(`/api/admin/gift-cards/${card.id}`, { method: 'DELETE' })
    if (r.ok) { onChanged(); onClose() }
    else { const e = await r.json().catch(() => null); setError(e?.error ?? 'DELETE FAILED') }
    setSaving(false)
  }

  async function sendEmail() {
    if (!card) return
    if (!draft.customerEmail || !emailDraft.smtpHost || !emailDraft.smtpFrom) { setError('EMAIL AND SMTP HOST/FROM REQUIRED'); return }
    setSaving(true); setError(''); setMessage('')
    const r = await fetch(`/api/admin/gift-cards/${card.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtpHost: emailDraft.smtpHost, smtpPort: parseInt(emailDraft.smtpPort), smtpUser: emailDraft.smtpUser,
        smtpPass: emailDraft.smtpPass, smtpFrom: emailDraft.smtpFrom,
        subject: emailDraft.subject, body: emailDraft.body,
      }),
    })
    if (r.ok) { setSendOpen(false); setMessage('EMAIL SENT'); onChanged(); load() }
    else { const e = await r.json().catch(() => null); setError(e?.error ?? 'SEND FAILED') }
    setSaving(false)
  }

  function openReplace() {
    if (!card) return
    setReplaceDraft({
      reason: '',
      customerName: draft.customerName,
      customerEmail: draft.customerEmail,
      amount: draft.amount,
      message: draft.message,
    })
    setError('')
    setReplaceOpen(true)
  }

  async function replaceCard() {
    if (!card) return
    const amount = parseFloat(replaceDraft.amount)
    if (!amount || amount <= 0) { setError('AMOUNT IS REQUIRED'); return }
    if (!replaceDraft.reason.trim()) { setError('A REASON IS REQUIRED'); return }
    setSaving(true); setError(''); setMessage('')
    const r = await fetch(`/api/admin/gift-cards/${card.id}/replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: replaceDraft.reason.trim(),
        customerName: replaceDraft.customerName || null,
        customerEmail: replaceDraft.customerEmail || null,
        amount,
        message: replaceDraft.message || null,
      }),
    })
    if (r.ok) {
      const d = await r.json()
      setReplaceOpen(false)
      setMessage(`REPLACED — NEW CARD #${d.newCard?.number ?? 'ISSUED'}`)
      onChanged()
      load()
    } else {
      const e = await r.json().catch(() => null)
      setError(e?.error ?? 'REPLACE FAILED')
    }
    setSaving(false)
  }

  // Merged, newest-first timeline of everything that touched the card or its
  // order — each row carries its ORIGIN so app actions and store activity are
  // unmistakable: CARD · APP (this card's own events), ORDER · APP (what the
  // app did to the linked order) and ORDER · STORE (WooCommerce sync/webhook/
  // push activity for the order).
  const timeline = [
    ...(card?.history ?? []).map((h) => ({
      at: h.at,
      origin: 'card' as const,
      title: EVENT_LABELS[h.type] ?? h.type,
      note: h.note,
    })),
    ...(order?.history ?? []).map((h) => ({
      at: h.at,
      origin: 'orderapp' as const,
      title: ORDER_EVENT_LABELS[h.type] ?? h.type,
      note: h.note,
    })),
    ...(detail?.logs ?? []).map((l) => ({
      at: l.createdAt,
      origin: 'orderstore' as const,
      title: l.direction === 'WEBHOOK' ? 'WEBHOOK' : `${l.direction} ORDER`,
      note: l.message,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1))

  if (!detail && !loadError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
        <div className="border border-grey-mid bg-grey-dark p-6"><p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p></div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="border border-grey-mid bg-grey-dark p-5 w-full max-w-6xl space-y-3 max-h-[94vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="font-mono text-base font-bold uppercase tracking-widest text-white">GIFT CARD {card?.number}</h2>
            <span className={`font-mono text-xs uppercase border px-2 py-0.5 ${card ? STATUS_COLORS[card.status] || 'text-grey-light' : ''} ${card ? 'border-grey-mid' : ''}`}>
              {card?.status ?? '—'}
            </span>
            {order && (
              <span className="font-mono text-[10px] uppercase text-[#60A5FA] border border-[#60A5FA]/50 px-1.5 py-0.5">WOO ORDER #{order.orderNumber ?? order.wooOrderId}</span>
            )}
          </div>
          {loadError && <span className="font-mono text-xs text-danger">{loadError}</span>}
          <button onClick={onClose} className="font-mono text-[10px] uppercase text-grey-light hover:text-white px-2 py-1 shrink-0">CLOSE</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 flex-1 overflow-hidden">
          {/* Left — card details, statuses, notes */}
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="border border-grey-mid p-3 space-y-2">
              <p className="font-mono text-[10px] uppercase text-grey-light tracking-wider">CARD DETAILS</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">CUSTOMER NAME</label>
                  <Input value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} placeholder="CUSTOMER NAME" />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">CUSTOMER EMAIL</label>
                  <Input value={draft.customerEmail} onChange={(e) => setDraft({ ...draft, customerEmail: e.target.value })} placeholder="email@example.com" />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">AMOUNT ($)</label>
                  <Input type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="0.00" className="text-right" />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">MESSAGE</label>
                  <Input value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder="Something special just for you..." />
                </div>
              </div>
              {card?.isInternal && <p className="font-mono text-[10px] text-[#FACC15]">INTERNAL — PRINT LATER</p>}
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={saveDetails} disabled={saving}>{saving ? 'SAVING' : 'SAVE DETAILS'}</Button>
                {card?.status === 'DRAFT' && (
                  <Button size="sm" onClick={issueCard} disabled={saving}>ISSUE + GENERATE PDF</Button>
                )}
                {card?.pdfPath && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => window.open(`/api/admin/gift-cards/${card.id}/pdf`, '_blank')}>DOWNLOAD PDF</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setError(''); setSendOpen(true) }}>SEND EMAIL</Button>
                  </>
                )}
                {(card?.status === 'ISSUED' || card?.status === 'SENT') && (
                  <Button size="sm" variant="ghost" onClick={() => setStatus('REDEEMED')} disabled={saving}>REDEEM</Button>
                )}
                {(card?.status === 'ISSUED' || card?.status === 'SENT') && (
                  <Button size="sm" variant="ghost" onClick={openReplace} disabled={saving}>REPLACE CARD</Button>
                )}
                {(card?.status === 'DRAFT' || card?.status === 'ISSUED' || card?.status === 'SENT') && (
                  <Button size="sm" variant="danger" onClick={() => setStatus('VOIDED')} disabled={saving}>VOID</Button>
                )}
                {(card?.status === 'ISSUED' || card?.status === 'SENT' || card?.status === 'VOIDED') && (
                  <Button size="sm" variant="ghost" onClick={resetCard} disabled={saving}>RESET</Button>
                )}
                {card?.status === 'VOIDED' && (
                  <Button size="sm" variant="danger" onClick={deleteCard} disabled={saving}>DELETE</Button>
                )}
              </div>
              {message && <p className="font-mono text-[10px] text-success">{message}</p>}
              {error && <p className="font-mono text-[10px] text-danger">{error}</p>}
            </div>

            <div className="border border-grey-mid p-3 space-y-2">
              <p className="font-mono text-[10px] uppercase text-grey-light tracking-wider">PRIVATE NOTES <span className="text-grey-light/50">(SAVED WITH DETAILS — LOGGED TO HISTORY)</span></p>
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={4}
                placeholder="INTERNAL NOTES — NOT SHOWN TO THE CUSTOMER"
                className="bg-black border border-grey-mid text-white font-sans text-sm px-3 py-2 w-full outline-none focus:border-white transition-colors placeholder:text-grey-light resize-none"
              />
            </div>

            {/* Status jump */}
            <div className="border border-grey-mid p-3 space-y-2">
              <p className="font-mono text-[10px] uppercase text-grey-light tracking-wider">STATUS — SET DIRECTLY</p>
              <div className="flex items-center gap-1 flex-wrap">
                {['DRAFT', 'ISSUED', 'SENT', 'REDEEMED', 'VOIDED', 'EXPIRED'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    disabled={saving || s === card?.status}
                    className={`font-mono text-[10px] uppercase border px-2 py-1 transition-colors disabled:opacity-40 ${
                      s === card?.status
                        ? 'border-white text-white'
                        : s === 'VOIDED' || s === 'EXPIRED'
                          ? 'border-danger/60 text-danger hover:bg-danger hover:text-black'
                          : s === 'REDEEMED'
                            ? 'border-success/60 text-success hover:bg-success hover:text-black'
                            : 'border-grey-mid text-grey-light hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right — order */}
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="border border-grey-mid p-3 space-y-2">
              <p className="font-mono text-[10px] uppercase text-grey-light tracking-wider">WOOCOMMERCE ORDER</p>
              {!card?.wooOrderId && !order && (
                <p className="font-mono text-[10px] text-grey-light uppercase">NO LINKED ORDER — INTERNAL CARD (CREATED IN THE APP)</p>
              )}
              {card?.wooOrderId && !order && (
                <p className="font-mono text-[10px] text-[#FACC15] uppercase">ORDER NOT FOUND — THE LINKED STORE ORDER IS MISSING OR DELETED</p>
              )}
              {order && (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <DetailRow label="ORDER" value={order.orderNumber ? `#${order.orderNumber}` : String(order.wooOrderId)} />
                    <DetailRow label="STORE STATUS" value={order.status ?? '—'} />
                    <DetailRow label="OPERATIONS" value={order.opStatus ?? '—'} />
                    <DetailRow label="PAYMENT" value={`${order.paymentStatus ?? '—'}${order.paymentMethod ? ` · ${order.paymentMethod}` : ''}`} />
                    <DetailRow label="PAID AT" value={fmt(order.paidAt)} />
                    <DetailRow label="TOTAL" value={order.totalAmount != null ? `$${order.totalAmount.toFixed(2)}` : '—'} />
                    <DetailRow label="CUSTOMER" value={order.customerName ?? '—'} />
                    <DetailRow label="CONTACT" value={[order.customerEmail, order.customerPhone].filter(Boolean).join(' · ') || '—'} />
                    <DetailRow label="PARTY" value={order.partySize ? `${order.partySize} PAX` : '—'} />
                    <DetailRow label="SERVICE" value={order.serviceDate ? `${String(order.serviceDate).slice(0, 10)} ${order.serviceTime ?? ''}` : '—'} />
                    <DetailRow label="SYNCED AT" value={fmt(order.syncedAt)} />
                    <DetailRow label="CREATED" value={fmt(order.createdAt)} />
                  </div>
                  {order.notes && (
                    <p className="font-mono text-[10px] text-grey-light border-t border-grey-mid pt-2">ORDER NOTE: {order.notes}</p>
                  )}
                  <div className="border-t border-grey-mid pt-2 space-y-1">
                    {order.items.length === 0 && <p className="font-mono text-[10px] text-grey-light">NO LINE ITEMS</p>}
                    {order.items.map((it) => (
                      <div key={it.id} className="flex items-center gap-2 text-[10px]">
                        <span className="font-mono text-white truncate min-w-0 flex-1">{it.productName ?? 'ITEM'}</span>
                        <span className="font-mono text-grey-light shrink-0">×{it.qty ?? 1}</span>
                        <span className="font-mono text-grey-light shrink-0">{it.unitPrice != null ? `$${(it.unitPrice ?? 0).toFixed(2)}` : ''}</span>
                        {it.allergenNote && <span className="font-mono uppercase text-danger border border-danger/50 px-1 shrink-0" title={it.allergenNote}>⚠</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* History — every row is labelled with WHO did it */}
            <div className="border border-grey-mid p-3 space-y-2">
              <p className="font-mono text-[10px] uppercase text-grey-light tracking-wider">
                HISTORY — EVERYTHING THAT TOUCHED THIS CARD &amp; ITS ORDER <span className="text-grey-light/50">(NEWEST FIRST)</span>
              </p>
              {timeline.length === 0 && <p className="font-mono text-[10px] text-grey-light">NO ACTIVITY YET</p>}
              <div className="space-y-1.5 max-h-[38vh] overflow-y-auto pr-1">
                {timeline.map((t, i) => (
                  <div key={`${t.at}-${i}`} className="border border-grey-mid/60 px-2 py-1.5 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-grey-light/70">{fmt(t.at)}</span>
                      <span
                        className={`font-mono text-[9px] uppercase border px-1 py-0.5 shrink-0 ${
                          t.origin === 'card'
                            ? 'border-white/40 text-white'
                            : t.origin === 'orderapp'
                              ? 'border-success/60 text-success'
                              : 'border-[#60A5FA]/60 text-[#60A5FA]'
                        }`}
                      >
                        {t.origin === 'card' ? 'CARD · APP' : t.origin === 'orderapp' ? 'ORDER · APP' : 'ORDER · STORE'}
                      </span>
                      <span
                        className={`font-mono text-[9px] uppercase shrink-0 ${
                          t.origin === 'orderstore' ? 'text-[#60A5FA]' : t.origin === 'orderapp' ? 'text-success' : 'text-grey-light'
                        }`}
                      >
                        {t.title}
                      </span>
                    </div>
                    <p className="font-sans text-[11px] text-white/90 break-words">{t.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Send email popup */}
        {sendOpen && card && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => setSendOpen(false)}>
            <div className="border border-grey-mid bg-grey-dark p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-mono text-sm uppercase tracking-widest text-white">SEND GIFT CARD — {card.number}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="md:col-span-2">
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">TO</label>
                  <Input value={draft.customerEmail} onChange={(e) => setDraft({ ...draft, customerEmail: e.target.value })} placeholder="recipient@example.com" />
                </div>
                <div className="md:col-span-2">
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">SUBJECT</label>
                  <Input value={emailDraft.subject} onChange={(e) => setEmailDraft({ ...emailDraft, subject: e.target.value })} placeholder={`Your Gift Card - ${card.number}`} />
                </div>
                <div className="md:col-span-2">
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">BODY</label>
                  <textarea
                    value={emailDraft.body}
                    onChange={(e) => setEmailDraft({ ...emailDraft, body: e.target.value })}
                    rows={3}
                    placeholder={`Please find your gift card attached.\n\nVoucher Number: ${card.number}\nAmount: $${card.amount.toFixed(2)}`}
                    className="bg-black border border-grey-mid text-white font-sans text-sm px-3 py-2 w-full outline-none focus:border-white transition-colors placeholder:text-grey-light resize-none"
                  />
                </div>
              </div>
              <div className="border-t border-grey-mid pt-2">
                <p className="font-mono text-[10px] uppercase text-grey-light tracking-wider mb-2">SMTP CONFIGURATION</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">HOST</label>
                    <Input value={emailDraft.smtpHost} onChange={(e) => setEmailDraft({ ...emailDraft, smtpHost: e.target.value })} placeholder="smtp.example.com" />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">PORT</label>
                    <Input value={emailDraft.smtpPort} onChange={(e) => setEmailDraft({ ...emailDraft, smtpPort: e.target.value })} className="text-right" />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">USER</label>
                    <Input value={emailDraft.smtpUser} onChange={(e) => setEmailDraft({ ...emailDraft, smtpUser: e.target.value })} />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">PASSWORD</label>
                    <Input type="password" value={emailDraft.smtpPass} onChange={(e) => setEmailDraft({ ...emailDraft, smtpPass: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">FROM</label>
                    <Input value={emailDraft.smtpFrom} onChange={(e) => setEmailDraft({ ...emailDraft, smtpFrom: e.target.value })} placeholder="noreply@yourvenue.co.nz" />
                  </div>
                </div>
              </div>
              <div className="border-t border-grey-mid pt-2 flex items-center gap-2">
                <Button size="sm" onClick={sendEmail} disabled={saving}>{saving ? 'SENDING' : 'SEND'}</Button>
                <Button variant="ghost" size="sm" onClick={() => setSendOpen(false)}>CANCEL</Button>
              </div>
            </div>
          </div>
        )}
        {/* Replace card popup */}
        {replaceOpen && card && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => setReplaceOpen(false)}>
            <div className="border border-grey-mid bg-grey-dark p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-mono text-sm uppercase tracking-widest text-white">REPLACE GIFT CARD — {card.number}</h3>
              <p className="font-mono text-[10px] text-danger uppercase leading-relaxed">
                THIS CARD WILL BE VOIDED AND A NEW CARD ISSUED WITH A NEW NUMBER. THE NEW CARD KEEPS THIS
                CARD&apos;S WOOCOMMERCE ORDER LINK — RESEND THE ORDER EMAIL FROM THE STORE TO DELIVER THE
                CORRECTED PDF TO THE CUSTOMER. THE OLD NUMBER IS NEVER REUSED.
              </p>
              <div className="space-y-2">
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">REASON (REQUIRED)</label>
                  <Input value={replaceDraft.reason} onChange={(e) => setReplaceDraft({ ...replaceDraft, reason: e.target.value })} placeholder="WRONG AMOUNT PRINTED / TYPO ON NAME — BE SPECIFIC" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">CUSTOMER NAME</label>
                    <Input value={replaceDraft.customerName} onChange={(e) => setReplaceDraft({ ...replaceDraft, customerName: e.target.value })} placeholder="CUSTOMER NAME" />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">CUSTOMER EMAIL</label>
                    <Input value={replaceDraft.customerEmail} onChange={(e) => setReplaceDraft({ ...replaceDraft, customerEmail: e.target.value })} placeholder="email@example.com" />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">AMOUNT ($)</label>
                    <Input type="number" value={replaceDraft.amount} onChange={(e) => setReplaceDraft({ ...replaceDraft, amount: e.target.value })} placeholder="0.00" className="text-right" />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">MESSAGE</label>
                    <Input value={replaceDraft.message} onChange={(e) => setReplaceDraft({ ...replaceDraft, message: e.target.value })} placeholder="Something special just for you..." />
                  </div>
                </div>
              </div>
              <div className="border-t border-grey-mid pt-2 flex items-center gap-2">
                <Button size="sm" variant="danger" onClick={replaceCard} disabled={saving}>{saving ? 'REPLACING' : 'VOID & ISSUE REPLACEMENT'}</Button>
                <Button variant="ghost" size="sm" onClick={() => setReplaceOpen(false)}>CANCEL</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] uppercase text-grey-light">{label}</div>
      <div className="font-mono text-[11px] text-white truncate" title={value}>{value}</div>
    </div>
  )
}
