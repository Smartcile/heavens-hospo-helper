'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// Issue popup: pick the details for the next blank card (mirrors the card
// edit popup layout), see the active template's design as a preview, then
// confirm. Issuing generates the PDF and marks the card ISSUED. When no draft
// is passed (`cardId` null) the server premakes the next card automatically —
// numbers only ever come from the premade series, never invented at issue time.

interface IssueGiftCardModalProps {
  cardId: string | null
  cardNumber: string
  templatePreviewUrl: string | null
  onClose: () => void
  onIssued: () => void
}

export function IssueGiftCardModal({ cardId, cardNumber, templatePreviewUrl, onClose, onIssued }: IssueGiftCardModalProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function issue() {
    const value = parseFloat(amount)
    if (!value || value <= 0) { setError('AMOUNT IS REQUIRED'); return }
    setSaving(true)
    setError('')
    const r = await fetch(cardId ? `/api/admin/gift-cards/${cardId}/issue` : '/api/admin/gift-cards/issue-next', {
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
    if (r.ok) {
      onIssued()
    } else {
      const d = await r.json().catch(() => null)
      setError(d?.error ?? 'ISSUE FAILED')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="border border-grey-mid bg-grey-dark p-5 w-full max-w-4xl space-y-3 max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="font-mono text-base font-bold uppercase tracking-widest text-white">ISSUE GIFT CARD</h2>
            <span className="font-mono text-sm text-grey-light">NUMBER {cardNumber}</span>
          </div>
          <button onClick={onClose} className="font-mono text-[10px] uppercase text-grey-light hover:text-white px-2 py-1 shrink-0">CLOSE</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 flex-1 overflow-hidden">
          {/* Details */}
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="border border-grey-mid p-3 space-y-3">
              <p className="font-mono text-[10px] uppercase text-grey-light tracking-wider">DETAILS</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">CUSTOMER NAME</label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="CUSTOMER NAME" />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">CUSTOMER EMAIL</label>
                  <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="email@example.com" />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">AMOUNT ($)</label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-right" autoFocus />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">MESSAGE</label>
                  <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Something special just for you..." />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="bg-grey-dark border border-grey-mid accent-white"
                />
                <span className="font-mono text-[10px] uppercase text-grey-light">INTERNAL (PRINT LATER)</span>
              </label>
            </div>

            {error && <p className="font-mono text-xs text-danger">{error}</p>}

            <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
              <Button size="sm" onClick={issue} disabled={saving}>
                {saving ? 'ISSUING...' : 'ISSUE GIFT CARD'}
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>CANCEL</Button>
            </div>
          </div>

          {/* Preview */}
          <div className="border border-grey-mid flex flex-col min-h-[360px] min-w-0">
            <div className="px-3 py-2 border-b border-grey-mid flex items-center justify-between gap-2">
              <span className="font-mono text-xs uppercase tracking-widest text-white">PREVIEW</span>
              <span className="font-mono text-[9px] uppercase text-grey-light">SAMPLE — WHAT THE CARD LOOKS LIKE</span>
            </div>
            {templatePreviewUrl ? (
              <iframe src={templatePreviewUrl} title="GIFT CARD TEMPLATE PREVIEW" className="w-full flex-1 bg-white min-h-0" />
            ) : (
              <div className="flex-1 flex items-center justify-center p-4">
                <p className="font-mono text-[10px] uppercase text-grey-light">
                  NO CUSTOM TEMPLATE — THE BUILT-IN CARD DESIGN WILL BE USED
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
