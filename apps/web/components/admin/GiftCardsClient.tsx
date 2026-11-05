'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { GiftCardModal } from '@/components/admin/GiftCardModal'
import { IssueGiftCardModal } from '@/components/admin/IssueGiftCardModal'
import { PdfCanvasViewer } from '@/components/ui/PdfCanvasViewer'

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
  wooOrderNumber: string | null
  issuedAt: string | null
  sentAt: string | null
  expiresAt: string | null
  pdfPath: string | null
  notes: string | null
  createdAt: string
}

interface GiftCardMapping {
  pdfField: string
  dataKey: string
  format?: string
}

interface GiftCardTemplate {
  id: string
  name: string
  filePath: string | null
  fieldMapping: GiftCardMapping[]
  isActive: boolean
  fields: { name: string; type: string }[]
}

const DATA_KEY_OPTIONS = [
  { key: 'number', label: 'VOUCHER NUMBER' },
  { key: 'amount', label: 'VALUE / AMOUNT' },
  { key: 'customerName', label: 'CUSTOMER NAME' },
  { key: 'issueDate', label: 'DATE OF ISSUE' },
  { key: 'message', label: 'MESSAGE' },
]

const AMOUNT_FORMAT_OPTIONS = [
  { value: '2dp', label: '$50.00' },
  { value: '0dp', label: '$50' },
]

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-grey-light',
  ISSUED: 'text-info',
  SENT: 'text-warning',
  REDEEMED: 'text-success',
  VOIDED: 'text-danger',
  EXPIRED: 'text-danger',
}

export function GiftCardsClient({ defaultYear }: { defaultYear?: string }) {
  const [cards, setCards] = useState<GiftCard[]>([])
  const [templates, setTemplates] = useState<GiftCardTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulk, setShowBulk] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  // Default to the CURRENT year (computed server-side in the active venue's
  // timezone) so a refresh always shows this year's cards; ALL is one click away.
  const [yearFilter, setYearFilter] = useState(defaultYear ?? String(new Date().getFullYear()))
  // The next premade card (server-authoritative — independent of the list
  // filters above).
  const [nextDraft, setNextDraft] = useState<{ id: string; number: string } | null>(null)

  const [issueOpen, setIssueOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const [saving, setSaving] = useState(false)

  const [bulkCount, setBulkCount] = useState('10')

  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateError, setTemplateError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [mappingTemplate, setMappingTemplate] = useState<GiftCardTemplate | null>(null)
  const [mappingError, setMappingError] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState('')
  const previewSeq = useRef(0)
  const [bulkError, setBulkError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (search) params.set('search', search)
    if (yearFilter) params.set('year', yearFilter)
    const [cardsRes, templatesRes, nextRes] = await Promise.all([
      fetch(`/api/admin/gift-cards?${params}`),
      fetch('/api/admin/gift-card-templates'),
      fetch('/api/admin/gift-cards/next-number'),
    ])
    if (cardsRes.ok) setCards(await cardsRes.json())
    if (templatesRes.ok) setTemplates(await templatesRes.json())
    if (nextRes.ok) {
      const d = await nextRes.json()
      setNextDraft(d?.draft ?? null)
    }
    setLoading(false)
  }, [search, statusFilter, yearFilter])

  useEffect(() => { load() }, [load])

  // Live preview for the mapping editor: every change to the draft mapping
  // re-renders the filled sample PDF (debounced) into the right-hand panel.
  useEffect(() => {
    if (!mappingTemplate?.id || !mappingTemplate.filePath) {
      setPreviewUrl(null)
      return
    }
    const seq = ++previewSeq.current
    setPreviewError('')
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/gift-card-templates/${mappingTemplate.id}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fieldMapping: mappingTemplate.fieldMapping }),
        })
        if (seq !== previewSeq.current) return
        if (!r.ok) { setPreviewUrl(null); setPreviewError('PREVIEW UNAVAILABLE'); return }
        const blob = await r.blob()
        if (seq !== previewSeq.current) return
        setPreviewError('')
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old)
          return URL.createObjectURL(blob)
        })
      } catch (err) {
        if (seq === previewSeq.current) { setPreviewUrl(null); setPreviewError('PREVIEW FAILED') }
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [mappingTemplate?.id, mappingTemplate?.filePath, mappingTemplate?.fieldMapping])

  const previewUrlRef = useRef<string | null>(null)
  useEffect(() => { previewUrlRef.current = previewUrl }, [previewUrl])
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])

  const activeTemplate = templates.find((t) => t.isActive) ?? null

  async function handleCreateBlank() {
    setSaving(true)
    const r = await fetch('/api/admin/gift-cards', { method: 'POST' })
    if (r.ok) load()
    setSaving(false)
  }

  async function handleCreateChosen(action: 'single' | 'bulk') {
    setCreateOpen(false)
    if (action === 'single') await handleCreateBlank()
    else setShowBulk(true)
  }

  async function handleBulkCreate() {
    if (!bulkCount) return
    setSaving(true)
    await fetch('/api/admin/gift-cards/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: parseInt(bulkCount) }),
    })
    setSaving(false)
    setShowBulk(false)
    load()
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkPrint() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setBulkError('')
    setSaving(true)
    const r = await fetch('/api/admin/gift-cards/bulk-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardIds: ids }),
    })
    if (r.ok) {
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Gift Cards - ${ids.length} cards.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setSelectedIds(new Set())
    } else {
      const err = await r.json().catch(() => null)
      setBulkError(err?.error ?? 'Print failed')
    }
    setSaving(false)
  }

  async function handleUpload() {
    if (!templateFile) return
    setTemplateError('')
    setUploading(true)
    const fd = new FormData()
    fd.append('file', templateFile)
    fd.append('name', templateName)
    const r = await fetch('/api/admin/gift-card-templates', { method: 'POST', body: fd })
    if (r.ok) {
      const created = await r.json()
      setTemplateFile(null)
      setTemplateName('')
      load()
      setMappingTemplate(created)
    } else {
      const err = await r.json().catch(() => null)
      setTemplateError(err?.error ?? 'Upload failed')
    }
    setUploading(false)
  }

  function openMapping(t: GiftCardTemplate) {
    const fieldNames = new Set(t.fields.map((f) => f.name))
    const mapping = t.fieldMapping.filter((m) => fieldNames.has(m.pdfField))
    setMappingError('')
    setMappingTemplate({ ...t, fieldMapping: mapping })
  }

  function updateMappingRow(index: number, patch: Partial<GiftCardMapping>) {
    if (!mappingTemplate) return
    const rows = mappingTemplate.fieldMapping.map((m, i) => (i === index ? { ...m, ...patch } : m))
    setMappingTemplate({ ...mappingTemplate, fieldMapping: rows })
  }

  async function saveMapping() {
    if (!mappingTemplate) return
    setMappingError('')
    const r = await fetch(`/api/admin/gift-card-templates/${mappingTemplate.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldMapping: mappingTemplate.fieldMapping }),
    })
    if (r.ok) {
      setMappingTemplate(null)
      load()
    } else {
      const err = await r.json().catch(() => null)
      setMappingError(err?.error ?? 'Save failed')
    }
  }

  async function setActive(t: GiftCardTemplate) {
    await fetch(`/api/admin/gift-card-templates/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    })
    load()
  }

  async function handleDeleteTemplate(t: GiftCardTemplate) {
    if (!window.confirm(`DELETE TEMPLATE "${t.name}"?`)) return
    await fetch(`/api/admin/gift-card-templates/${t.id}`, { method: 'DELETE' })
    load()
  }

  async function handleReplaceFile(t: GiftCardTemplate, file: File) {
    if (!file) return
    setTemplateError('')
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch(`/api/admin/gift-card-templates/${t.id}/file`, { method: 'PUT', body: fd })
    if (r.ok) {
      const updated = await r.json()
      // Refresh the list and open the mapping editor so the new file's fields
      // can be confirmed against the (auto-adapted) mapping with live preview.
      setTemplates((prev) => [updated, ...prev.filter((x) => x.id !== t.id)])
      setMappingError('')
      setMappingTemplate(updated)
      load()
    } else {
      const err = await r.json().catch(() => null)
      setTemplateError(err?.error ?? 'Replace failed')
    }
    setUploading(false)
  }

  async function handleRemoveFile(t: GiftCardTemplate) {
    const warn = t.isActive
      ? `REMOVE THE PDF FROM ACTIVE TEMPLATE "${t.name}"?\n\nTHIS TEMPLATE IS ACTIVE — NEW CARDS WILL USE THE BUILT-IN DESIGN UNTIL YOU UPLOAD A REPLACEMENT.`
      : `REMOVE THE PDF FROM TEMPLATE "${t.name}"?\n\nNEW CARDS WILL USE THE BUILT-IN DESIGN UNTIL YOU UPLOAD A REPLACEMENT. ALREADY-ISSUED CARD PDFS ARE UNAFFECTED.`
    if (!window.confirm(warn)) return
    const r = await fetch(`/api/admin/gift-card-templates/${t.id}/file`, { method: 'DELETE' })
    if (r.ok) {
      const updated = await r.json()
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, filePath: null, fields: [] } : x)))
      setTemplateError('')
    } else {
      const err = await r.json().catch(() => null)
      setTemplateError(err?.error ?? 'Remove failed')
    }
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">GIFT CARDS</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column — Issue */}
        <div className="lg:col-span-4 space-y-4">

          {/* Issue Box */}
          <Panel variant="outline" padding="lg" className="space-y-4">
            <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
              ISSUE GIFT CARD {draftCount > 0 && <span className="text-white">({draftCount} AVAILABLE)</span>}
            </h2>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm text-white">NEXT CARD: {nextDraft?.number ?? '—'}</span>
              {activeTemplate && (
                <span className="font-mono text-xs uppercase border border-info text-info px-1.5 py-0.5">
                  TEMPLATE: {activeTemplate.name}
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-grey-light leading-relaxed">
              OPENS THE ISSUE POPUP — CUSTOMER DETAILS, AMOUNT, MESSAGE AND A PREVIEW OF THE CARD DESIGN BEFORE CONFIRMING.
              {!nextDraft && ' NO BLANK CARDS EXIST — ONE WILL BE PREMADE AUTOMATICALLY WHEN YOU ISSUE.'}
            </p>
            <div className="border-t border-grey-mid pt-3">
              <Button size="sm" onClick={() => setIssueOpen(true)}>
                ISSUE GIFT CARD
              </Button>
            </div>
          </Panel>

          {/* Issue popup */}
          {issueOpen && (
            <IssueGiftCardModal
              cardId={nextDraft?.id ?? null}
              cardNumber={nextDraft?.number ?? '—'}
              templates={templates}
              activeTemplateId={activeTemplate?.id ?? null}
              onClose={() => setIssueOpen(false)}
              onIssued={() => { setIssueOpen(false); load() }}
            />
          )}

          {/* Template Box */}
          <Panel variant="outline" padding="lg" className="space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                GIFT CARD TEMPLATE
              </h2>
              {activeTemplate && (
                <span className="font-mono text-xs uppercase text-info">
                  ACTIVE: {activeTemplate.name}
                </span>
              )}
            </div>

            {templates.map((t) => (
              <Panel key={t.id} variant="outline" padding="md" className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-white truncate">{t.name}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {t.isActive && (
                      <span className="font-mono text-xs uppercase border border-info text-info px-1.5 py-0.5">ACTIVE</span>
                    )}
                    {!t.filePath && (
                      <span className="font-mono text-xs uppercase border border-warning text-warning px-1.5 py-0.5" title="THE PDF WAS REMOVED — NEW CARDS USE THE BUILT-IN DESIGN">NO FILE</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Button size="sm" variant="ghost" onClick={() => openMapping(t)} disabled={!t.filePath}>MAPPING</Button>
                  <Button size="sm" variant="ghost" onClick={() => window.open(`/api/admin/gift-card-templates/${t.id}/preview`, '_blank')} disabled={!t.filePath}>PREVIEW</Button>
                  {!t.isActive && (
                    <Button size="sm" variant="ghost" onClick={() => setActive(t)}>SET ACTIVE</Button>
                  )}
                  <label className="font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 text-grey-light hover:text-white hover:border-white transition-colors cursor-pointer" title="UPLOAD A NEW PDF ONTO THIS TEMPLATE — KEEPS NAME, MAPPING (ADAPTED TO THE NEW FIELDS) AND ACTIVE STATE">
                    {t.filePath ? 'REPLACE FILE' : 'UPLOAD FILE'}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) handleReplaceFile(t, f)
                      }}
                    />
                  </label>
                  {t.filePath && (
                    <Button size="sm" variant="danger" onClick={() => handleRemoveFile(t)}>REMOVE FILE</Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => handleDeleteTemplate(t)}>DELETE</Button>
                </div>
              </Panel>
            ))}

            <div className="border-t border-grey-mid pt-3 space-y-2">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">UPLOAD PDF TEMPLATE</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="TEMPLATE NAME" />
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)}
                  className="font-mono text-xs text-grey-light file:mr-2 file:px-2 file:py-1 file:bg-grey-dark file:border file:border-grey-mid file:text-white file:font-mono file:text-xs file:uppercase file:cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleUpload} disabled={uploading || !templateFile}>
                  {uploading ? 'UPLOADING' : 'UPLOAD TEMPLATE'}
                </Button>
                {templateFile && (
                  <span className="font-mono text-xs text-grey-light truncate">{templateFile.name}</span>
                )}
              </div>
              {templateError && <p className="font-mono text-xs text-danger">{templateError}</p>}
              <p className="font-mono text-xs text-grey-light leading-relaxed">
                PDF MUST CONTAIN FILLABLE FORM FIELDS. AFTER UPLOAD, MAP EACH FIELD TO A GIFT CARD VALUE.
              </p>
            </div>
          </Panel>

        </div>

        {/* Right Column — Cards List */}
        <div className="lg:col-span-8">
          <Panel variant="outline" padding="lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-xs font-bold text-white uppercase">
                CARDS ({cards.length})
              </h2>
              <div className="flex items-center gap-1">
                {/* Create Gift Cards — split control: main part = SINGLE,
                    the ▾ to the right opens SINGLE / BULK choices */}
                <div className="relative">
                  <div className="flex">
                    <Button size="sm" onClick={() => handleCreateChosen('single')} disabled={saving} title="CREATE ONE BLANK CARD">
                      CREATE GIFT CARDS
                    </Button>
                    <button
                      onClick={() => setCreateOpen((v) => !v)}
                      title="CREATE SINGLE OR BULK"
                      className="ml-px font-mono text-xs uppercase bg-grey-dark text-grey-light hover:text-white border border-grey-mid px-1.5"
                    >
                      ▾
                    </button>
                  </div>
                  {createOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setCreateOpen(false)} aria-hidden />
                      <Panel padding="none" className="absolute right-0 mt-1 z-50 shadow-xl min-w-[150px]">
                        <button
                          onClick={() => handleCreateChosen('single')}
                          disabled={saving}
                          className="w-full text-left px-3 py-2 font-mono text-xs uppercase tracking-wider text-grey-light hover:text-white hover:bg-black/40 disabled:opacity-40"
                        >
                          + SINGLE
                        </button>
                        <button
                          onClick={() => handleCreateChosen('bulk')}
                          className="w-full text-left px-3 py-2 font-mono text-xs uppercase tracking-wider text-grey-light hover:text-white hover:bg-black/40"
                        >
                          BULK
                        </button>
                      </Panel>
                    </>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBulkPrint}
                  disabled={saving || selectedIds.size === 0}
                  title="PRINT SELECTED CARDS AS ONE PDF"
                >
                  BULK PRINT ({selectedIds.size})
                </Button>
              </div>
            </div>

            {bulkError && <p className="font-mono text-xs text-danger mb-2">{bulkError}</p>}

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
                  title={yearFilter ? `SHOWING CARDS NUMBERED ${yearFilter}####` : 'SHOWING CARDS FROM EVERY YEAR'}
                  className="bg-grey-dark border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
                >
                  <option value="">ALL</option>
                  {(() => {
                    const base = parseInt(yearFilter, 10) || new Date().getFullYear()
                    return [base - 1, base, base + 1, base + 2].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))
                  })()}
                </select>
              </div>
            </div>

            <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
              {cards.map((c) => (
                <button
                  key={c.id}
                  onClick={(e) => { e.stopPropagation(); setOpenCardId(c.id) }}
                  title={`OPEN ${c.number}`}
                  className="w-full text-left px-2 py-1.5 border border-success hover:border-white flex items-center gap-2 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelected(c.id) }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-grey-dark border border-grey-mid accent-white shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between">
                      <span className="font-mono text-xs text-white">{c.number}</span>
                      <span className="flex items-center gap-2">
                        {c.wooOrderNumber && (
                          <span className="font-mono text-xs uppercase text-info">WOO #{c.wooOrderNumber}</span>
                        )}
                        <span className={`font-mono text-xs border px-1.5 py-0.5 ${c.amount === 0 ? 'border-warning text-warning' : 'border-danger text-danger'}`}>
                          ${c.amount.toFixed(2)}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center justify-between mt-0.5">
                      <span className={`font-mono text-xs uppercase ${STATUS_COLORS[c.status] || 'text-grey-light'}`}>
                        {c.status}
                      </span>
                      <span className="font-sans text-xs text-grey-light truncate max-w-[200px]">
                        {c.customerName || (c.isInternal ? 'INTERNAL' : '')}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
              {cards.length === 0 && (
                <p className="font-mono text-xs text-grey-light px-2 py-1">No gift cards. Click CREATE GIFT CARDS to make some.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* Bulk Create Modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowBulk(false)}>
          <Panel padding="xl" className="w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-sm uppercase tracking-widest text-white">BULK CREATE</h2>
            <p className="font-mono text-xs text-grey-light">NUMBERS 1–100 — THE LOWEST FREE ARE USED FIRST</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
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
          </Panel>
        </div>
      )}

      {/* Field Mapping Modal */}
      {mappingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setMappingTemplate(null)}>
          <Panel padding="lg" className="w-full max-w-6xl space-y-4 max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm uppercase tracking-widest text-white">FIELD MAPPING</h2>
              <span className="font-mono text-xs text-grey-light truncate">{mappingTemplate.name}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(300px,360px)] gap-4 min-h-0 flex-1">
              {/* Left — the mapping rows */}
              <div className="space-y-2 overflow-y-auto pr-1">
                {mappingTemplate.fieldMapping.length === 0 && (
                  <p className="border border-grey-mid p-3 font-mono text-xs text-grey-light">
                    NO MAPPED FIELDS{mappingTemplate.filePath ? ' — SET EACH PDF FIELD TO A GIFT CARD VALUE.' : ' — THIS TEMPLATE HAS NO PDF FILE. UPLOAD A FILE FIRST.'}
                  </p>
                )}
                {mappingTemplate.fieldMapping.map((m, i) => (
                  <Panel key={m.pdfField} variant="outline" padding="xs" className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <div className="md:col-span-4">
                      <div className="font-mono text-xs text-white truncate">{m.pdfField}</div>
                      <div className="font-mono text-xs uppercase text-grey-light">{mappingTemplate.fields.find((f) => f.name === m.pdfField)?.type ?? ''}</div>
                    </div>
                    <div className="md:col-span-5">
                      <select
                        value={m.dataKey}
                        onChange={(e) => updateMappingRow(i, { dataKey: e.target.value, ...(e.target.value === 'amount' ? {} : { format: undefined }) })}
                        className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white w-full"
                      >
                        <option value="">— BLANK —</option>
                        {DATA_KEY_OPTIONS.map((k) => (
                          <option key={k.key} value={k.key}>{k.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      {m.dataKey === 'amount' ? (
                        <select
                          value={m.format ?? '2dp'}
                          onChange={(e) => updateMappingRow(i, { format: e.target.value })}
                          className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white w-full"
                        >
                          {AMOUNT_FORMAT_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono text-xs uppercase text-grey-light">FORMAT: AUTO</span>
                      )}
                    </div>
                  </Panel>
                ))}

                {mappingError && <p className="font-mono text-xs text-danger">{mappingError}</p>}

                <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
                  <Button size="sm" onClick={saveMapping}>SAVE MAPPING</Button>
                  <Button variant="ghost" size="sm" onClick={() => setMappingTemplate(null)}>CLOSE</Button>
                </div>
              </div>

              {/* Right — live preview of the filled sample card */}
              <Panel variant="outline" padding="none" className="flex flex-col min-h-[420px] min-w-0">
                <div className="px-3 py-2 border-b border-grey-mid flex items-center justify-between gap-2">
                  <span className="font-mono text-xs uppercase tracking-widest text-white">LIVE PREVIEW</span>
                  <span className="font-mono text-xs uppercase text-grey-light">REFRESHES AS YOU MAP</span>
                </div>
                {previewUrl ? (
                  <PdfCanvasViewer url={previewUrl} title="GIFT CARD PREVIEW" />
                ) : (
                  <div className="flex-1 flex items-center justify-center p-4">
                    <p className={`font-mono text-xs uppercase ${previewError ? 'text-danger' : 'text-grey-light'}`}>
                      {mappingTemplate.filePath
                        ? (previewError || 'PREPARING PREVIEW...')
                        : 'NO PDF FILE — PREVIEW UNAVAILABLE'}
                    </p>
                  </div>
                )}
              </Panel>
            </div>
          </Panel>
        </div>
      )}

      {/* Card popup — edit details, statuses, private notes, the linked
          WooCommerce order and the full history/app↔store activity feed */}
      {openCardId && (
        <GiftCardModal
          cardId={openCardId}
          onClose={() => setOpenCardId(null)}
          onChanged={() => load()}
        />
      )}
    </div>
  )
}
