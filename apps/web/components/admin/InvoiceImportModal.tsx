'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'

interface SupplierOption {
  id: string
  name: string
}

interface ItemOption {
  id: string
  name: string
}

interface TemplateOption {
  id: string
  name: string
  version: number
  status: string
}

interface ParsedLine {
  description: string
  supplierSku: string | null
  qty: number
  unitPrice: number
  lineTotal: number
  match: { inventoryItemId?: string | null }
  poLine: { id: string } | null
}

interface PreviewPayload {
  fileUrl: string | null
  template: { id: string; name: string; version: number }
  header: {
    invoiceNumber?: string
    invoiceDate?: string
    dueDate?: string
    subtotal?: number
    gst?: number
    total?: number
  }
  lines: ParsedLine[]
  issues: string[]
  purchaseOrderId: string | null
}

interface EditableLine {
  key: string
  description: string
  supplierSku: string | null
  qty: number
  unitPrice: number
  inventoryItemId: string
  purchaseOrderLineId: string | null
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function InvoiceImportModal({
  isOpen,
  onClose,
  suppliers,
  inventoryItems,
  role: _role,
  venueId,
  onDone,
}: {
  isOpen: boolean
  onClose: () => void
  suppliers: SupplierOption[]
  inventoryItems: ItemOption[]
  role: string
  venueId: string
  onDone: () => void
}) {
  const [supplierId, setSupplierId] = useState('')
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [templateId, setTemplateId] = useState('')
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [fileBase64, setFileBase64] = useState('')
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')

  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')

  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [number, setNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [subtotal, setSubtotal] = useState('')
  const [gst, setGst] = useState('')
  const [total, setTotal] = useState('')
  const [lines, setLines] = useState<EditableLine[]>([])
  const [confirmItemCodes, setConfirmItemCodes] = useState(true)
  const [confirmAliases, setConfirmAliases] = useState(true)

  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    if (!supplierId) {
      setTemplates([])
      setTemplateId('')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const params = new URLSearchParams({ supplierId, venueId })
        const res = await fetch(`/api/admin/supplier-templates?${params.toString()}`)
        const body = await res.json().catch(() => [])
        if (cancelled || !res.ok || !Array.isArray(body)) return
        const usable = (body as TemplateOption[]).filter(
          (t) => t.status === 'ACTIVE' || t.status === 'DRAFT',
        )
        setTemplates(usable)
        const active = usable.find((t) => t.status === 'ACTIVE') ?? usable[0]
        setTemplateId(active?.id ?? '')
      } catch {
        /* template list is optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, supplierId, venueId])

  function reset() {
    setSupplierId('')
    setTemplates([])
    setTemplateId('')
    setMode('file')
    setFileBase64('')
    setFileName('')
    setText('')
    setExtracting(false)
    setExtractError('')
    setPreview(null)
    setNumber('')
    setInvoiceDate('')
    setDueDate('')
    setSubtotal('')
    setGst('')
    setTotal('')
    setLines([])
    setConfirmItemCodes(true)
    setConfirmAliases(true)
    setCommitting(false)
    setCommitError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFile(file: File | null) {
    setExtractError('')
    if (!file) {
      setFileBase64('')
      setFileName('')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      setFileBase64(base64)
      setFileName(file.name)
    }
    reader.readAsDataURL(file)
  }

  async function extract() {
    if (!supplierId) {
      setExtractError('CHOOSE A SUPPLIER FIRST')
      return
    }
    if (mode === 'file' && !fileBase64) {
      setExtractError('CHOOSE A PDF OR PASTE TEXT')
      return
    }
    if (mode === 'text' && !text.trim()) {
      setExtractError('PASTE THE INVOICE TEXT FIRST')
      return
    }
    setExtracting(true)
    setExtractError('')
    setCommitError('')
    try {
      const payload =
        mode === 'file'
          ? { venueId, supplierId, templateId, fileBase64, fileName }
          : { venueId, supplierId, templateId, text }
      const res = await fetch('/api/admin/supplier-invoices/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setExtractError(String(body.error ?? 'COULD NOT READ THE INVOICE'))
        return
      }
      applyPreview(body as PreviewPayload)
    } catch {
      setExtractError('COULD NOT REACH THE SERVER')
    } finally {
      setExtracting(false)
    }
  }

  function applyPreview(body: PreviewPayload) {
    setPreview(body)
    setNumber(body.header?.invoiceNumber ?? '')
    setInvoiceDate(body.header?.invoiceDate ?? '')
    setDueDate(body.header?.dueDate ?? '')
    setSubtotal(body.header?.subtotal != null ? String(body.header.subtotal) : '')
    setGst(body.header?.gst != null ? String(body.header.gst) : '')
    setTotal(body.header?.total != null ? String(body.header.total) : '')
    setLines(
      (body.lines ?? []).map((line, index) => ({
        key: `${index}-${line.description}`,
        description: line.description,
        supplierSku: line.supplierSku ?? null,
        qty: line.qty,
        unitPrice: line.unitPrice,
        inventoryItemId: line.match?.inventoryItemId ?? '',
        purchaseOrderLineId: line.poLine?.id ?? null,
      })),
    )
  }

  function patchLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  async function commit() {
    if (!supplierId || !preview) return
    if (!number.trim()) {
      setCommitError('INVOICE NUMBER IS REQUIRED')
      return
    }
    setCommitting(true)
    setCommitError('')
    try {
      const res = await fetch('/api/admin/supplier-invoices/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId,
          supplierId,
          purchaseOrderId: preview.purchaseOrderId,
          fileUrl: preview.fileUrl,
          header: {
            invoiceNumber: number.trim(),
            invoiceDate: invoiceDate || null,
            dueDate: dueDate || null,
            currency: 'NZD',
          },
          lines: lines.map((line) => {
            const qty = Number(line.qty) || 0
            const unitPrice = Number(line.unitPrice) || 0
            return {
              description: line.description,
              supplierSku: line.supplierSku,
              qty,
              unitPrice,
              lineTotal: round2(qty * unitPrice),
              inventoryItemId: line.inventoryItemId || null,
              purchaseOrderLineId: line.purchaseOrderLineId,
            }
          }),
          confirmItemCodes,
          confirmAliases,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCommitError(String(body.error ?? 'IMPORT FAILED'))
        return
      }
      reset()
      onDone()
      onClose()
    } catch {
      setCommitError('COULD NOT REACH THE SERVER')
    } finally {
      setCommitting(false)
    }
  }

  const dirty = Boolean(supplierId || text || fileBase64 || preview)

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="IMPORT SUPPLIER INVOICE" size="xl" dirty={dirty}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="SUPPLIER"
            aria-label="SUPPLIER"
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value)
              setPreview(null)
            }}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="CHOOSE SUPPLIER"
          />
          <Select
            label="TEMPLATE"
            aria-label="TEMPLATE"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            options={templates.map((t) => ({
              value: t.id,
              label: `${t.name} · V${t.version} · ${t.status}`,
            }))}
            placeholder={templates.length ? 'CHOOSE TEMPLATE' : 'NO TEMPLATE FOR THIS SUPPLIER'}
            disabled={!supplierId || templates.length === 0}
          />
        </div>

        {!preview && (
          <>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={mode === 'file' ? 'primary' : 'ghost'}
                onClick={() => setMode('file')}
              >
                PDF FILE
              </Button>
              <Button
                size="sm"
                variant={mode === 'text' ? 'primary' : 'ghost'}
                onClick={() => setMode('text')}
              >
                PASTE TEXT
              </Button>
            </div>

            {mode === 'file' ? (
              <div className="space-y-1">
                <label className="font-mono text-xs uppercase text-grey-light">INVOICE PDF</label>
                <input
                  type="file"
                  accept="application/pdf"
                  aria-label="INVOICE PDF"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  className="font-mono text-xs text-white"
                />
                {fileName && (
                  <p className="font-mono text-2xs uppercase text-grey-light">
                    {fileName} READY
                  </p>
                )}
              </div>
            ) : (
              <Textarea
                label="INVOICE TEXT"
                aria-label="INVOICE TEXT"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="PASTE THE INVOICE TEXT HERE..."
                className="min-h-[10rem]"
              />
            )}

            {extractError && (
              <p className="font-mono text-xs text-danger border border-danger p-2">{extractError}</p>
            )}

            <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
              <Button onClick={() => void extract()} loading={extracting}>
                EXTRACT &amp; PREVIEW
              </Button>
              <Button variant="ghost" onClick={handleClose}>
                CANCEL
              </Button>
            </div>
          </>
        )}

        {preview && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Input
                label="INVOICE NUMBER"
                aria-label="INVOICE NUMBER"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
              <Input
                label="INVOICE DATE"
                aria-label="INVOICE DATE"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
              <Input
                label="DUE DATE"
                aria-label="DUE DATE"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <Input
                label="SUBTOTAL"
                aria-label="SUBTOTAL"
                value={subtotal}
                onChange={(e) => setSubtotal(e.target.value)}
                className="text-right"
              />
              <Input
                label="GST"
                aria-label="GST"
                value={gst}
                onChange={(e) => setGst(e.target.value)}
                className="text-right"
              />
              <Input
                label="TOTAL"
                aria-label="TOTAL"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className="text-right"
              />
            </div>

            {preview.issues.length > 0 && (
              <div className="border border-warning p-2 space-y-0.5">
                <p className="font-mono text-xs uppercase text-warning">
                  {preview.issues.length} LINE ISSUE(S)
                </p>
                {preview.issues.map((issue, i) => (
                  <p key={`${issue}-${i}`} className="font-mono text-2xs uppercase text-grey-light">
                    {issue}
                  </p>
                ))}
              </div>
            )}

            <div className="overflow-x-auto border border-grey-mid">
              <table className="w-full border-collapse font-mono text-xs">
                <thead>
                  <tr className="bg-grey-dark/40">
                    {['DESCRIPTION', 'SKU', 'QTY', 'UNIT PRICE', 'LINE TOTAL', 'MATCH TO ITEM'].map((h) => (
                      <th
                        key={h}
                        className="text-left uppercase tracking-wider text-grey-light px-3 py-1.5 border-b border-grey-mid whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.key} className="border-b border-grey-mid last:border-b-0 text-white">
                      <td className="px-3 py-2 min-w-[12rem]">{line.description}</td>
                      <td className="px-3 py-2 text-grey-light">{line.supplierSku ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{line.qty}</td>
                      <td className="px-3 py-2 tabular-nums">${line.unitPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        ${(Number(line.qty) * Number(line.unitPrice)).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 min-w-[14rem]">
                        <Select
                          aria-label={`ITEM FOR LINE ${index + 1}`}
                          value={line.inventoryItemId}
                          onChange={(e) => patchLine(line.key, { inventoryItemId: e.target.value })}
                          options={inventoryItems.map((item) => ({ value: item.id, label: item.name }))}
                          placeholder="UNMATCHED / NEW"
                        />
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 font-mono text-xs text-grey-light uppercase">
                        NO LINES PARSED.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light">
                <input
                  type="checkbox"
                  aria-label="CONFIRM SKUS"
                  checked={confirmItemCodes}
                  onChange={(e) => setConfirmItemCodes(e.target.checked)}
                />
                CONFIRM SKUs
              </label>
              <label className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light">
                <input
                  type="checkbox"
                  aria-label="CONFIRM ALIASES"
                  checked={confirmAliases}
                  onChange={(e) => setConfirmAliases(e.target.checked)}
                />
                CONFIRM ALIASES
              </label>
            </div>

            {commitError && (
              <p className="font-mono text-xs text-danger border border-danger p-2">{commitError}</p>
            )}

            <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
              <Button onClick={() => void commit()} loading={committing}>
                COMMIT INVOICE
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPreview(null)
                  setCommitError('')
                }}
              >
                BACK
              </Button>
              <Button variant="ghost" onClick={handleClose}>
                CANCEL
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
