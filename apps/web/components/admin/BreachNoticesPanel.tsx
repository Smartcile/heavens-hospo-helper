'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { PdfViewerModal, type PdfViewerTarget } from '@/components/ui/PdfViewerModal'
import { inlinePdfUrl } from '@/lib/pdf-actions'
import { getActiveVenueId } from '@/lib/active-venue'
import { describeBreachKind, describeBreachStatus, isBreachPhoto } from '@/lib/breach-notices'
import { formatDateDMY } from '@/lib/date-nav'

export interface BreachNoticeRow {
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
  subjectStaffName: string | null
  reviewedByName: string | null
  createdAt: string
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  SUBMITTED: 'warning',
  WAIVED: 'success',
  DECLINED: 'danger',
  PAID: 'success',
  WITHDRAWN: 'default',
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'ALL STATUSES' },
  { value: 'SUBMITTED', label: 'AWAITING REVIEW' },
  { value: 'WAIVED', label: 'WAIVED' },
  { value: 'DECLINED', label: 'DECLINED' },
  { value: 'PAID', label: 'PAID' },
  { value: 'WITHDRAWN', label: 'WITHDRAWN' },
]

function money(value: number | null): string {
  return value == null ? '-' : `$${value.toFixed(2)}`
}

function fileLabel(url: string, index: number): string {
  return isBreachPhoto(url) ? `PHOTO ${index + 1}` : `PDF TICKET ${index + 1}`
}

export function BreachNoticesPanel({
  role,
  sessionVenueId,
  defaultVenueId,
}: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string
}) {
  const [items, setItems] = useState<BreachNoticeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canReview, setCanReview] = useState(false)
  const [subjectFilter, setSubjectFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [selected, setSelected] = useState<BreachNoticeRow | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [pdfTarget, setPdfTarget] = useState<PdfViewerTarget | null>(null)

  function venueQuery(): string {
    const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
    return venueId ? `?venueId=${encodeURIComponent(venueId)}` : ''
  }

  async function load() {
    const r = await fetch(`/api/admin/breach-notices${venueQuery()}`)
    if (!r.ok) {
      setError(r.status === 403 ? 'YOU DO NOT HAVE ACCESS TO BREACH NOTICES' : 'COULD NOT LOAD NOTICES')
      setItems([])
      setLoading(false)
      return
    }
    const data = await r.json()
    setItems(Array.isArray(data.items) ? data.items : [])
    setCanReview(!!data.canReview)
    setError('')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const visible = useMemo(
    () =>
      items.filter(
        (row) =>
          (subjectFilter === 'ALL' || row.subjectType === subjectFilter) &&
          (statusFilter === 'ALL' || row.status === statusFilter),
      ),
    [items, subjectFilter, statusFilter],
  )

  const counts = useMemo(() => {
    const out: Record<string, number> = { SUBMITTED: 0, WAIVED: 0, DECLINED: 0, PAID: 0, WITHDRAWN: 0 }
    for (const row of items) out[row.status] = (out[row.status] ?? 0) + 1
    return out
  }, [items])

  function open(row: BreachNoticeRow) {
    setSelected(row)
    setNote('')
    setActionError('')
  }

  function refreshSelected(row: BreachNoticeRow) {
    const next = items.find((item) => item.id === row.id) ?? null
    setSelected(next)
  }

  async function act(action: 'WAIVE' | 'DECLINE' | 'PAID' | 'WITHDRAW') {
    if (!selected) return
    if (action !== 'WITHDRAW' && !note.trim()) {
      setActionError('ADD A REASON FOR THIS DECISION')
      return
    }
    setBusy(true)
    setActionError('')
    const r = await fetch(`/api/admin/breach-notices/${selected.id}/review${venueQuery()}`, {
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
    await load()
    const updated = await fetch(`/api/admin/breach-notices/${selected.id}${venueQuery()}`)
    if (updated.ok) {
      setSelected(await updated.json())
    } else {
      refreshSelected(selected)
    }
    setNote('')
    setBusy(false)
  }

  function openGeneratedPdf(row: BreachNoticeRow) {
    const path = `/api/admin/breach-notices/${row.id}/pdf${venueQuery()}`
    setPdfTarget({
      url: inlinePdfUrl(path),
      downloadUrl: path,
      filename: `BREACH NOTICE - ${row.numberplate}.pdf`,
      title: 'BREACH NOTICE',
    })
  }

  function openAttachment(row: BreachNoticeRow, url: string) {
    setPdfTarget({
      url: inlinePdfUrl(url),
      downloadUrl: url,
      filename: url.split('/').pop() || 'ticket.pdf',
      title: 'TICKET PDF',
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-mono text-lg font-bold uppercase tracking-widest">BREACH NOTICES</h2>
        <p className="font-mono text-xs text-grey-light mt-1 uppercase">
          STAFF AND CLIENT INFRINGEMENTS — WAIVE, DECLINE OR MARK PAID
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {['ALL', 'STAFF', 'CLIENT'].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSubjectFilter(value)}
              className={`font-mono text-xs uppercase border px-3 py-1.5 transition-colors ${
                subjectFilter === value ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:border-white hover:text-white'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="min-w-[12rem]">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={STATUS_OPTIONS}
          />
        </div>
        <span className="font-mono text-xs uppercase text-grey-light">
          {counts.SUBMITTED ?? 0} AWAITING · {counts.WAIVED ?? 0} WAIVED · {counts.DECLINED ?? 0} DECLINED · {counts.PAID ?? 0} PAID
        </span>
      </div>

      {error && <p className="font-mono text-xs uppercase text-danger">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : visible.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO BREACH NOTICES MATCH THIS FILTER.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => open(row)}
              className="w-full text-left bg-grey-dark border border-grey-mid p-3 space-y-2 hover:border-white transition-colors"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold uppercase text-white">{row.numberplate}</span>
                    <Badge>{row.subjectType}</Badge>
                    <Badge>{describeBreachKind(row.kind)}</Badge>
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{describeBreachStatus(row.status)}</Badge>
                  </div>
                  <p className="font-mono text-xs uppercase text-grey-light mt-1">
                    {formatDateDMY(row.breachDate.slice(0, 10))}
                    {row.subjectType === 'CLIENT' && row.clientName ? ` · ${row.clientName}` : ''}
                    {row.submittedByName ? ` · BY ${row.submittedByName}` : ''}
                  </p>
                </div>
                <span className="font-mono text-xs text-grey-light">{money(row.fineAmount)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `BREACH NOTICE — ${selected.numberplate}` : 'BREACH NOTICE'}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{selected.subjectType}</Badge>
              <Badge>{describeBreachKind(selected.kind)}</Badge>
              <Badge variant={STATUS_VARIANT[selected.status] ?? 'default'}>{describeBreachStatus(selected.status)}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ['NUMBER PLATE', selected.numberplate],
                ['BREACH DATE', formatDateDMY(selected.breachDate.slice(0, 10))],
                ['LOCATION', selected.location || '-'],
                ['ISSUING AUTHORITY', selected.issuingAuthority || '-'],
                ['FINE AMOUNT', money(selected.fineAmount)],
                ['PAYMENT DUE', selected.paymentDueDate ? formatDateDMY(selected.paymentDueDate.slice(0, 10)) : '-'],
                ['SUBMITTED BY', selected.submittedByName || '-'],
                ...(selected.subjectType === 'CLIENT'
                  ? [
                      ['CLIENT', selected.clientName || '-'],
                      ['REFERENCE', selected.clientReference || '-'],
                    ]
                  : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="font-mono text-xs uppercase text-grey-light">{label}</div>
                  <div className="font-mono text-xs text-white break-words">{value}</div>
                </div>
              ))}
            </div>

            <div className="border border-grey-mid p-3">
              <div className="font-mono text-xs uppercase text-grey-light mb-1">NOTICE DETAILS</div>
              <p className="font-mono text-xs text-white whitespace-pre-wrap">{selected.noticeDetails}</p>
              {selected.notes && (
                <>
                  <div className="font-mono text-xs uppercase text-grey-light mt-3 mb-1">NOTES</div>
                  <p className="font-mono text-xs text-white whitespace-pre-wrap">{selected.notes}</p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => openGeneratedPdf(selected)}>VIEW NOTICE PDF</Button>
              {(selected.attachmentUrls ?? []).map((url, index) =>
                isBreachPhoto(url) ? (
                  <img
                    key={url}
                    src={url}
                    alt={`Notice photo ${index + 1}`}
                    className="w-20 h-20 object-cover border border-grey-mid"
                  />
                ) : (
                  <Button key={url} size="sm" variant="ghost" onClick={() => openAttachment(selected, url)}>
                    {fileLabel(url, index)}
                  </Button>
                ),
              )}
            </div>

            {selected.status === 'SUBMITTED' ? (
              <div className="border-t border-grey-mid pt-3 space-y-2">
                <div className="font-mono text-xs uppercase text-grey-light">DECISION</div>
                {selected.reviewNote && (
                  <p className="font-mono text-xs text-grey-light">LAST NOTE: {selected.reviewNote}</p>
                )}
                {canReview ? (
                  <>
                    <Textarea
                      label="Reason (required)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Why this notice is being waived / declined / paid"
                    />
                    {actionError && <p className="font-mono text-xs uppercase text-danger">{actionError}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => act('WAIVE')} loading={busy}>WAIVE</Button>
                      <Button size="sm" variant="ghost" onClick={() => act('DECLINE')} loading={busy}>DECLINE</Button>
                      <Button size="sm" variant="ghost" onClick={() => act('PAID')} loading={busy}>MARK PAID</Button>
                      <Button size="sm" variant="danger" onClick={() => act('WITHDRAW')} loading={busy}>WITHDRAW</Button>
                    </div>
                  </>
                ) : (
                  <p className="font-mono text-xs uppercase text-grey-light">THIS NOTICE IS AWAITING A REVIEWER.</p>
                )}
              </div>
            ) : (
              <div className="border-t border-grey-mid pt-3 space-y-1">
                <div className="font-mono text-xs uppercase text-grey-light">DECISION</div>
                <p className="font-mono text-xs text-white">
                  {describeBreachStatus(selected.status)}
                  {selected.reviewedByName ? ` · ${selected.reviewedByName}` : ''}
                </p>
                {selected.reviewedAt && (
                  <p className="font-mono text-xs text-grey-light">
                    {formatDateDMY(selected.reviewedAt.slice(0, 10))}
                  </p>
                )}
                {selected.reviewNote && <p className="font-mono text-xs text-white">REASON: {selected.reviewNote}</p>}
              </div>
            )}
          </div>
        )}
      </Modal>

      <PdfViewerModal target={pdfTarget} onClose={() => setPdfTarget(null)} />
    </div>
  )
}
