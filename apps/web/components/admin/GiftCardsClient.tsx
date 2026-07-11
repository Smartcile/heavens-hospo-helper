'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface GiftCard {
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
  expiresAt: string | null
  pdfPath: string | null
  notes: string | null
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-grey-light',
  ISSUED: 'text-[#60A5FA]',
  SENT: 'text-[#FACC15]',
  REDEEMED: 'text-success',
  VOIDED: 'text-danger',
  EXPIRED: 'text-danger',
}

export function GiftCardsClient() {
  const [cards, setCards] = useState<GiftCard[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showBulk, setShowBulk] = useState(false)
  const [showSend, setShowSend] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()))

  const [issueCustomerName, setIssueCustomerName] = useState('')
  const [issueCustomerEmail, setIssueCustomerEmail] = useState('')
  const [issueAmount, setIssueAmount] = useState('')
  const [issueMessage, setIssueMessage] = useState('')
  const [issueInternal, setIssueInternal] = useState(false)

  const [formCustomerName, setFormCustomerName] = useState('')
  const [formCustomerEmail, setFormCustomerEmail] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [bulkYear, setBulkYear] = useState(String(new Date().getFullYear()))
  const [bulkCount, setBulkCount] = useState('10')

  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')

  function resetIssueForm() {
    setIssueCustomerName('')
    setIssueCustomerEmail('')
    setIssueAmount('')
    setIssueMessage('')
    setIssueInternal(false)
  }

  function resetForm() {
    setFormCustomerName('')
    setFormCustomerEmail('')
    setFormAmount('')
    setFormMessage('')
    setFormNotes('')
  }

  function populateForm(c: GiftCard) {
    setFormCustomerName(c.customerName ?? '')
    setFormCustomerEmail(c.customerEmail ?? '')
    setFormAmount(String(c.amount))
    setFormMessage(c.message ?? '')
    setFormNotes(c.notes ?? '')
    setEmailSubject(`Your Gift Card - ${c.number}`)
    setEmailBody(`Please find your gift card attached.\n\nVoucher Number: ${c.number}\nAmount: $${c.amount.toFixed(2)}`)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (search) params.set('search', search)
    if (yearFilter) params.set('year', yearFilter)
    const r = await fetch(`/api/admin/gift-cards?${params}`)
    if (r.ok) setCards(await r.json())
    setLoading(false)
  }, [search, statusFilter, yearFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (selectedId) {
      const c = cards.find((x) => x.id === selectedId)
      if (c) populateForm(c)
    }
  }, [selectedId])

  const selected = cards.find((c) => c.id === selectedId) ?? null
  const nextDraft = cards.filter((c) => c.status === 'DRAFT').sort((a, b) => a.number.localeCompare(b.number))[0] ?? null

  async function handleCreateBlank() {
    setSaving(true)
    const r = await fetch('/api/admin/gift-cards', { method: 'POST' })
    if (r.ok) load()
    setSaving(false)
  }

  async function handleBulkCreate() {
    if (!bulkCount) return
    setSaving(true)
    await fetch('/api/admin/gift-cards/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: parseInt(bulkYear), count: parseInt(bulkCount) }),
    })
    setSaving(false)
    setShowBulk(false)
    load()
  }

  async function handleIssue() {
    if (!nextDraft || !issueAmount || parseFloat(issueAmount) <= 0) return
    setSaving(true)
    const r = await fetch(`/api/admin/gift-cards/${nextDraft.id}/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: issueCustomerName || null,
        customerEmail: issueCustomerEmail || null,
        amount: parseFloat(issueAmount),
        message: issueMessage || null,
        isInternal: issueInternal,
      }),
    })
    if (r.ok) {
      resetIssueForm()
      load()
    }
    setSaving(false)
  }

  async function handleSave() {
    if (!selectedId || !formAmount || parseFloat(formAmount) <= 0) return
    setSaving(true)
    await fetch(`/api/admin/gift-cards/${selectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: formCustomerName || null,
        customerEmail: formCustomerEmail || null,
        amount: parseFloat(formAmount),
        message: formMessage || null,
        notes: formNotes || null,
      }),
    })
    setSaving(false)
    load()
  }

  async function handleDownload() {
    if (!selectedId) return
    window.open(`/api/admin/gift-cards/${selectedId}/pdf`, '_blank')
  }

  async function handleSend() {
    if (!selectedId) return
    setSaving(true)
    await fetch(`/api/admin/gift-cards/${selectedId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtpHost, smtpPort: parseInt(smtpPort), smtpUser, smtpPass, smtpFrom,
        subject: emailSubject, body: emailBody,
      }),
    })
    setSaving(false)
    setShowSend(false)
    load()
  }

  async function handleVoid() {
    if (!selectedId) return
    setSaving(true)
    await fetch(`/api/admin/gift-cards/${selectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'VOIDED' }),
    })
    setSaving(false)
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  const draftCount = cards.filter((c) => c.status === 'DRAFT').length

  return (
    <div className="space-y-4" onClick={() => { if (selectedId) { setSelectedId(null); resetForm(); } }}>
      <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">GIFT CARDS</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column — Issue / Details */}
        <div className="lg:col-span-4">

          {/* Combined Issue / Details Box */}
          <div className="border border-grey-mid p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            {!selectedId ? (
              <>
                <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                  ISSUE GIFT CARD {draftCount > 0 && <span className="text-white">({draftCount} AVAILABLE)</span>}
                </h2>

                {!nextDraft ? (
                  <p className="font-mono text-xs text-grey-light uppercase">
                    NO BLANK CARDS AVAILABLE — CREATE SOME FIRST
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-white">{nextDraft.number}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">CUSTOMER NAME</label>
                        <Input value={issueCustomerName} onChange={(e) => setIssueCustomerName(e.target.value)} placeholder="CUSTOMER NAME" />
                      </div>
                      <div>
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">CUSTOMER EMAIL</label>
                        <Input value={issueCustomerEmail} onChange={(e) => setIssueCustomerEmail(e.target.value)} placeholder="email@example.com" />
                      </div>
                      <div>
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">AMOUNT ($)</label>
                        <Input type="number" value={issueAmount} onChange={(e) => setIssueAmount(e.target.value)} placeholder="0.00" className="text-right" />
                      </div>
                      <div>
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">MESSAGE</label>
                        <Input value={issueMessage} onChange={(e) => setIssueMessage(e.target.value)} placeholder="Something special just for you..." />
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={issueInternal}
                          onChange={(e) => setIssueInternal(e.target.checked)}
                          className="bg-grey-dark border border-grey-mid accent-white"
                        />
                        <span className="font-mono text-xs text-grey-light">INTERNAL (PRINT LATER)</span>
                      </label>
                    </div>

                    <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
                      <Button size="sm" onClick={handleIssue} disabled={saving || !issueAmount || parseFloat(issueAmount) <= 0}>
                        {saving ? 'ISSUING' : 'ISSUE GIFT CARD'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={resetIssueForm}>CLEAR</Button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                    GIFT CARD {selected?.number}
                  </h2>
                  <span className={`font-mono text-xs uppercase ${selected ? STATUS_COLORS[selected.status] || 'text-grey-light' : ''}`}>
                    {selected?.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">CUSTOMER NAME</label>
                    <Input value={formCustomerName} onChange={(e) => setFormCustomerName(e.target.value)} placeholder="CUSTOMER NAME" />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">CUSTOMER EMAIL</label>
                    <Input value={formCustomerEmail} onChange={(e) => setFormCustomerEmail(e.target.value)} placeholder="email@example.com" />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">AMOUNT ($)</label>
                    <Input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0.00" className="text-right" />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">MESSAGE</label>
                    <Input value={formMessage} onChange={(e) => setFormMessage(e.target.value)} placeholder="Something special just for you..." />
                  </div>
                </div>

                <div>
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">NOTES</label>
                  <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="INTERNAL NOTES" />
                </div>

                {selected?.isInternal && (
                  <p className="font-mono text-xs text-[#FACC15]">INTERNAL — PRINT LATER</p>
                )}

                <div className="border-t border-grey-mid pt-3 flex items-center gap-2 flex-wrap">
                  {selected?.pdfPath && (
                    <>
                      <Button size="sm" variant="ghost" onClick={handleDownload}>DOWNLOAD PDF</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowSend(true)}>SEND EMAIL</Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving}>
                    {saving ? 'SAVING' : 'SAVE'}
                  </Button>
                  {(selected?.status === 'DRAFT' || selected?.status === 'ISSUED') && (
                    <Button size="sm" variant="danger" onClick={handleVoid} disabled={saving}>VOID</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedId(null); resetForm() }}>DESELECT</Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Column — Cards List */}
        <div className="lg:col-span-8" onClick={() => { if (selectedId) { setSelectedId(null); resetForm(); } }}>
          <div className="border border-grey-mid p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-xs font-bold text-white uppercase">
                CARDS ({cards.length})
              </h2>
              <div className="flex gap-1">
                <Button size="sm" onClick={handleCreateBlank} disabled={saving}>
                  + SINGLE
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowBulk(true)}>
                  BULK
                </Button>
              </div>
            </div>

            <div className="space-y-2 mb-3">
              <Input
                placeholder="SEARCH..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-xs"
              />
              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-grey-dark border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white flex-1"
                >
                  <option value="">ALL</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="ISSUED">ISSUED</option>
                  <option value="SENT">SENT</option>
                  <option value="REDEEMED">REDEEMED</option>
                  <option value="VOIDED">VOIDED</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="bg-grey-dark border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
                >
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
              {cards.map((c) => (
                <button
                  key={c.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(c.id) }}
                  className={`w-full text-left px-2 py-1.5 border ${
                    selectedId === c.id
                      ? 'border-white'
                      : 'border-success hover:border-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-white">{c.number}</span>
                    <span className={`font-mono text-xs border px-1.5 py-0.5 ${c.amount === 0 ? 'border-[#FACC15] text-[#FACC15]' : 'border-danger text-danger'}`}>
                      ${c.amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className={`font-mono text-[10px] uppercase ${STATUS_COLORS[c.status] || 'text-grey-light'}`}>
                      {c.status}
                    </span>
                    <span className="font-sans text-[10px] text-grey-light truncate max-w-[200px]">
                      {c.customerName || (c.isInternal ? 'INTERNAL' : '')}
                    </span>
                  </div>
                </button>
              ))}
              {cards.length === 0 && (
                <p className="font-mono text-xs text-grey-light px-2 py-1">No gift cards. Click + SINGLE or BULK to create.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Create Modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowBulk(false)}>
          <div className="border border-grey-mid bg-grey-dark p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-sm uppercase tracking-widest text-white">BULK CREATE</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">YEAR</label>
                <Input value={bulkYear} onChange={(e) => setBulkYear(e.target.value)} className="text-right" />
              </div>
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">COUNT</label>
                <Input type="number" value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} className="text-right" />
              </div>
            </div>
            <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
              <Button size="sm" onClick={handleBulkCreate} disabled={saving || !bulkCount}>
                {saving ? 'CREATING' : 'CREATE'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowBulk(false)}>CANCEL</Button>
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {showSend && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowSend(false)}>
          <div className="border border-grey-mid bg-grey-dark p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-sm uppercase tracking-widest text-white">SEND GIFT CARD</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">TO</label>
                <Input value={formCustomerEmail} onChange={(e) => setFormCustomerEmail(e.target.value)} placeholder="recipient@example.com" />
              </div>
              <div className="md:col-span-2">
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">SUBJECT</label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">BODY</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={4}
                  className="bg-grey-dark border border-grey-mid text-white font-sans text-sm px-3 py-2 w-full outline-none focus:border-white transition-colors placeholder:text-grey-light resize-none"
                />
              </div>
            </div>

            <div className="border-t border-grey-mid pt-3">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider mb-3">SMTP CONFIGURATION</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">HOST</label>
                  <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
                </div>
                <div>
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">PORT</label>
                  <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="text-right" />
                </div>
                <div>
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">USER</label>
                  <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                </div>
                <div>
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">PASSWORD</label>
                  <Input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">FROM</label>
                  <Input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="noreply@akaranaeatery.co.nz" />
                </div>
              </div>
            </div>

            <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
              <Button size="sm" onClick={handleSend} disabled={saving || !formCustomerEmail || !smtpHost || !smtpFrom}>
                {saving ? 'SENDING' : 'SEND'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowSend(false)}>CANCEL</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
