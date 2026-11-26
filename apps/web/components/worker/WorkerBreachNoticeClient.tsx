'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { PdfViewerModal, type PdfViewerTarget } from '@/components/ui/PdfViewerModal'
import { useWorkerImmersive } from '@/components/worker/useWorkerImmersive'
import {
  BREACH_ATTACHMENT_LIMIT,
  describeBreachKind,
  describeBreachStatus,
  isBreachPhoto,
  validateBreachNotice,
} from '@/lib/breach-notices'
import { formatDateDMY, localDayKey } from '@/lib/date-nav'
import { inlinePdfUrl } from '@/lib/pdf-actions'

interface BreachRow {
  id: string
  subjectType: string
  kind: string
  numberplate: string
  noticeDetails: string
  breachDate: string
  location: string | null
  issuingAuthority: string | null
  fineAmount: number | null
  paymentDueDate: string | null
  notes: string | null
  clientName: string | null
  clientReference: string | null
  attachmentUrls: string[] | null
  status: string
  reviewNote: string | null
  reviewedAt: string | null
  submittedByName: string | null
  reviewedByName: string | null
}

interface Access {
  allowed: boolean
  venueWide: boolean
  canReview: boolean
  canSubmitClient: boolean
}

interface UploadedFile {
  url: string
  photo: boolean
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  SUBMITTED: 'warning',
  WAIVED: 'success',
  DECLINED: 'danger',
  PAID: 'success',
  WITHDRAWN: 'default',
}

const KIND_OPTIONS = [
  { value: 'PARKING', label: 'PARKING' },
  { value: 'VEHICLE', label: 'VEHICLE' },
  { value: 'CONDUCT', label: 'CONDUCT' },
  { value: 'OTHER', label: 'OTHER' },
]

type Mode = 'list' | 'new' | 'detail'

function emptyForm() {
  return {
    subjectType: 'STAFF',
    kind: 'PARKING',
    numberplate: '',
    noticeDetails: '',
    breachDate: localDayKey(),
    location: '',
    issuingAuthority: '',
    fineAmount: '',
    paymentDueDate: '',
    notes: '',
    clientName: '',
    clientReference: '',
  }
}

function money(value: number | null): string {
  return value == null ? '-' : `$${value.toFixed(2)}`
}

export function WorkerBreachNoticeClient({ initialId }: { initialId?: string }) {
  const router = useRouter()
  const [access, setAccess] = useState<Access>({ allowed: false, venueWide: false, canReview: false, canSubmitClient: false })
  const [items, setItems] = useState<BreachRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('list')
  const [selected, setSelected] = useState<BreachRow | null>(null)

  const [form, setForm] = useState(emptyForm)
  const [attachments, setAttachments] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pdfTarget, setPdfTarget] = useState<PdfViewerTarget | null>(null)

  useWorkerImmersive(mode !== 'list')

  async function load() {
    const r = await fetch('/api/worker/breach-notices')
    if (r.status === 401) { router.push('/w/login'); return }
    if (!r.ok) {
      setError('COULD NOT LOAD BREACH NOTICES')
      setLoading(false)
      return
    }
    const data = await r.json()
    setAccess({
      allowed: !!data.allowed,
      venueWide: !!data.venueWide,
      canReview: !!data.canReview,
      canSubmitClient: !!data.canSubmitClient,
    })
    setItems(Array.isArray(data.items) ? data.items : [])
    setLoading(false)
    if (initialId) {
      const found = (data.items as BreachRow[]).find((row) => row.id === initialId)
      if (found) {
        setSelected(found)
        setMode('detail')
      }
    }
  }

  useEffect(() => { load() }, [])

  const canUseClient = access.canSubmitClient
  const today = useMemo(() => localDayKey(), [])

  function openNew() {
    // STAFF is the everyday path even for a manager; CLIENT is an explicit toggle.
    setForm({ ...emptyForm(), subjectType: 'STAFF' })
    setAttachments([])
    setUploadError('')
    setFormError('')
    setMode('new')
  }

  function openDetail(row: BreachRow) {
    setSelected(row)
    setNote('')
    setActionError('')
    setMode('detail')
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadError('')
    setUploading(true)
    const remaining = BREACH_ATTACHMENT_LIMIT - attachments.length
    const chosen = Array.from(files).slice(0, Math.max(0, remaining))
    for (const file of chosen) {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/worker/breach-notices/attachment', { method: 'POST', body: fd })
      if (r.status === 401) { router.push('/w/login'); return }
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        setUploadError(data.error ?? 'UPLOAD FAILED')
        continue
      }
      const data = await r.json()
      setAttachments((prev) => [...prev, { url: data.url, photo: isBreachPhoto(data.url) }])
    }
    setUploading(false)
  }

  async function submit() {
    setFormError('')
    const validated = validateBreachNotice(
      { ...form, attachmentUrls: attachments.map((file) => file.url) },
      { today },
    )
    if (!validated.ok) {
      setFormError(validated.error)
      return
    }
    setSaving(true)
    const r = await fetch('/api/worker/breach-notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, attachmentUrls: attachments.map((file) => file.url) }),
    })
    if (r.status === 401) { router.push('/w/login'); return }
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      setFormError(data.error ?? 'COULD NOT SUBMIT THE NOTICE')
      setSaving(false)
      return
    }
    const data = await r.json()
    await load()
    const detail = await fetch(`/api/worker/breach-notices/${data.notice.id}`)
    if (detail.ok) {
      setSelected(await detail.json())
      setMode('detail')
    } else {
      setMode('list')
    }
    setForm(emptyForm())
    setAttachments([])
    setSaving(false)
  }

  async function act(action: 'WAIVE' | 'DECLINE' | 'PAID' | 'WITHDRAW') {
    if (!selected) return
    if (action !== 'WITHDRAW' && !note.trim()) {
      setActionError('ADD A REASON FOR THIS DECISION')
      return
    }
    setBusy(true)
    setActionError('')
    const url = action === 'WITHDRAW'
      ? `/api/worker/breach-notices/${selected.id}/withdraw`
      : `/api/worker/breach-notices/${selected.id}/review`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note }),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      setActionError(data.error ?? 'COULD NOT SAVE THE DECISION')
      setBusy(false)
      return
    }
    const detail = await fetch(`/api/worker/breach-notices/${selected.id}`)
    if (detail.ok) setSelected(await detail.json())
    await load()
    setNote('')
    setBusy(false)
  }

  function openGeneratedPdf(row: BreachRow) {
    const path = `/api/worker/breach-notices/${row.id}/pdf`
    setPdfTarget({
      url: inlinePdfUrl(path),
      downloadUrl: path,
      filename: `BREACH NOTICE - ${row.numberplate}.pdf`,
      title: 'BREACH NOTICE',
    })
  }

  function openAttachment(url: string) {
    setPdfTarget({
      url: inlinePdfUrl(url),
      downloadUrl: url,
      filename: url.split('/').pop() || 'ticket.pdf',
      title: 'TICKET PDF',
    })
  }

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  if (mode === 'new') {
    return (
      <div className="min-h-screen bg-black pb-24">
        <div className="px-4 pt-6 pb-4 border-b border-grey-mid flex items-center gap-3">
          <button onClick={() => setMode('list')} className="font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 text-grey-light hover:border-white hover:text-white transition-colors">← BACK</button>
          <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">NEW BREACH NOTICE</h1>
        </div>
        <div className="px-4 py-4 space-y-3">
          {canUseClient && (
            <div className="flex gap-1">
              {(['STAFF', 'CLIENT'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm({ ...form, subjectType: value })}
                  className={`flex-1 h-11 font-mono text-xs uppercase border transition-colors ${
                    form.subjectType === value ? 'border-white text-white' : 'border-grey-mid text-grey-light'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          )}

          <Input label="Number plate" value={form.numberplate} onChange={(e) => setForm({ ...form, numberplate: e.target.value })} placeholder="ABC123" autoCapitalize="characters" />
          <Input label="Breach date" type="date" value={form.breachDate} onChange={(e) => setForm({ ...form, breachDate: e.target.value })} />
          <Textarea label="Breach notice details" value={form.noticeDetails} onChange={(e) => setForm({ ...form, noticeDetails: e.target.value })} placeholder="Ticket / reference number and what the notice says" />
          <Select label="Notice type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={KIND_OPTIONS} />
          <Input label="Location (optional)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Input label="Issuing authority (optional)" value={form.issuingAuthority} onChange={(e) => setForm({ ...form, issuingAuthority: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fine amount (optional)" type="number" inputMode="decimal" value={form.fineAmount} onChange={(e) => setForm({ ...form, fineAmount: e.target.value })} placeholder="0.00" />
            <Input label="Payment due (optional)" type="date" value={form.paymentDueDate} onChange={(e) => setForm({ ...form, paymentDueDate: e.target.value })} />
          </div>

          {form.subjectType === 'CLIENT' && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Client name (optional)" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              <Input label="Client reference (optional)" value={form.clientReference} onChange={(e) => setForm({ ...form, clientReference: e.target.value })} />
            </div>
          )}

          <div className="border border-grey-mid p-3 space-y-2">
            <div className="font-mono text-xs uppercase text-grey-light tracking-wider">Photos / PDF ticket (1–{BREACH_ATTACHMENT_LIMIT})</div>
            <p className="font-mono text-2xs uppercase text-grey-light">AT LEAST ONE PHOTO IS REQUIRED.</p>
            <div className="flex flex-wrap gap-2">
              {attachments.map((file) => (
                file.photo ? (
                  <img key={file.url} src={file.url} alt="Notice photo" className="w-20 h-20 object-cover border border-grey-mid" />
                ) : (
                  <span key={file.url} className="border border-grey-mid px-2 py-1 font-mono text-2xs uppercase text-white">PDF ADDED</span>
                )
              ))}
            </div>
            {attachments.length < BREACH_ATTACHMENT_LIMIT && (
              <label className={`inline-flex items-center justify-center h-11 px-4 border font-mono text-xs uppercase cursor-pointer ${uploading ? 'border-grey-mid text-grey-light opacity-50' : 'border-grey-mid text-white'}`}>
                {uploading ? 'UPLOADING…' : '+ ADD PHOTO OR PDF'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => { void upload(e.target.files); e.currentTarget.value = '' }}
                />
              </label>
            )}
            {uploadError && <p className="font-mono text-xs uppercase text-danger">{uploadError}</p>}
          </div>

          <Textarea label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          {formError && <p className="font-mono text-xs uppercase text-danger">{formError}</p>}
          <div className="flex gap-2">
            <Button onClick={submit} loading={saving} className="flex-1">SUBMIT NOTICE</Button>
            <Button variant="ghost" onClick={() => setMode('list')}>CANCEL</Button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'detail' && selected) {
    return (
      <div className="min-h-screen bg-black pb-24">
        <div className="px-4 pt-6 pb-4 border-b border-grey-mid flex items-center gap-3">
          <button onClick={() => setMode('list')} className="font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 text-grey-light hover:border-white hover:text-white transition-colors">← NOTICES</button>
          <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">{selected.numberplate}</h1>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge>{selected.subjectType}</Badge>
            <Badge>{describeBreachKind(selected.kind)}</Badge>
            <Badge variant={STATUS_VARIANT[selected.status] ?? 'default'}>{describeBreachStatus(selected.status)}</Badge>
          </div>

          <div className="border border-grey-mid p-3 grid grid-cols-2 gap-3">
            {[
              ['BREACH DATE', formatDateDMY(selected.breachDate.slice(0, 10))],
              ['FINE', money(selected.fineAmount)],
              ['LOCATION', selected.location || '-'],
              ['AUTHORITY', selected.issuingAuthority || '-'],
              ['SUBMITTED BY', selected.submittedByName || '-'],
              ...(selected.subjectType === 'CLIENT'
                ? [
                    ['CLIENT', selected.clientName || '-'],
                    ['REFERENCE', selected.clientReference || '-'],
                  ]
                : []),
            ].map(([label, value]) => (
              <div key={label}>
                <div className="font-mono text-2xs uppercase text-grey-light">{label}</div>
                <div className="font-mono text-xs text-white break-words">{value}</div>
              </div>
            ))}
          </div>

          <div className="border border-grey-mid p-3">
            <div className="font-mono text-2xs uppercase text-grey-light mb-1">NOTICE DETAILS</div>
            <p className="font-mono text-xs text-white whitespace-pre-wrap">{selected.noticeDetails}</p>
            {selected.notes && <p className="font-mono text-xs text-grey-light mt-2 whitespace-pre-wrap">{selected.notes}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => openGeneratedPdf(selected)}>VIEW NOTICE PDF</Button>
            {(selected.attachmentUrls ?? []).map((url) =>
              isBreachPhoto(url) ? (
                <img key={url} src={url} alt="Notice photo" className="w-20 h-20 object-cover border border-grey-mid" />
              ) : (
                <Button key={url} size="sm" variant="ghost" onClick={() => openAttachment(url)}>TICKET PDF</Button>
              ),
            )}
          </div>

          {selected.status === 'SUBMITTED' ? (
            <div className="border border-grey-mid p-3 space-y-2">
              <div className="font-mono text-2xs uppercase text-grey-light">AWAITING REVIEW</div>
              {access.canReview && (
                <>
                  <Textarea label="Reason (required)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this notice is being waived / declined / paid" />
                  {actionError && <p className="font-mono text-xs uppercase text-danger">{actionError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => act('WAIVE')} loading={busy}>WAIVE</Button>
                    <Button size="sm" variant="ghost" onClick={() => act('DECLINE')} loading={busy}>DECLINE</Button>
                    <Button size="sm" variant="ghost" onClick={() => act('PAID')} loading={busy}>MARK PAID</Button>
                  </div>
                </>
              )}
              <Button size="sm" variant="danger" onClick={() => act('WITHDRAW')} loading={busy}>WITHDRAW NOTICE</Button>
            </div>
          ) : (
            <div className="border border-grey-mid p-3 space-y-1">
              <div className="font-mono text-2xs uppercase text-grey-light">DECISION</div>
              <p className="font-mono text-xs text-white">
                {describeBreachStatus(selected.status)}
                {selected.reviewedByName ? ` · ${selected.reviewedByName}` : ''}
              </p>
              {selected.reviewNote && <p className="font-mono text-xs text-grey-light">REASON: {selected.reviewNote}</p>}
            </div>
          )}
        </div>
        <PdfViewerModal target={pdfTarget} onClose={() => setPdfTarget(null)} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-24">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid flex items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">BREACH NOTICES</h1>
          <p className="font-mono text-xs text-grey-light mt-0.5 uppercase">
            {access.venueWide ? 'VENUE QUEUE' : 'YOUR OWN NOTICES'}
          </p>
        </div>
        <Button size="sm" onClick={openNew}>+ NEW</Button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {error && <p className="font-mono text-xs uppercase text-danger">{error}</p>}
        {items.length === 0 ? (
          <p className="font-mono text-xs text-grey-light">NO BREACH NOTICES YET.</p>
        ) : (
          items.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => openDetail(row)}
              className="w-full text-left bg-grey-dark border border-grey-mid p-3 space-y-2 hover:border-white transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold uppercase text-white">{row.numberplate}</span>
                <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{describeBreachStatus(row.status)}</Badge>
              </div>
              <div className="font-mono text-2xs uppercase text-grey-light">
                {row.subjectType} · {describeBreachKind(row.kind)} · {formatDateDMY(row.breachDate.slice(0, 10))}
                {row.submittedByName && access.venueWide ? ` · ${row.submittedByName}` : ''}
              </div>
              <p className="font-mono text-xs text-grey-light truncate">{row.noticeDetails}</p>
            </button>
          ))
        )}
      </div>

      <PdfViewerModal target={pdfTarget} onClose={() => setPdfTarget(null)} />
    </div>
  )
}
