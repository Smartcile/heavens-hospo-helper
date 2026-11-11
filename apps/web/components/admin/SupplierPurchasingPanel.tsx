'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'

interface ItemOption {
  id: string
  name: string
  unit: string
}

interface SupplierItemCode {
  id: string
  supplierSku: string
  purchasePrice: number | null
  inventoryItem: { id: string; name: string; unit: string | null } | null
}

interface SupplierAlias {
  id: string
  normalisedTextKey: string
  source: string
  inventoryItem: { id: string; name: string } | null
}

interface SupplierTemplate {
  id: string
  name: string
  version: number
  status: string
}

export function SupplierPurchasingPanel({
  supplierId,
  venueId: venueIdProp,
}: {
  supplierId: string
  venueId?: string
}) {
  const [venueId, setVenueId] = useState(venueIdProp ?? '')
  const [items, setItems] = useState<ItemOption[]>([])
  const [codes, setCodes] = useState<SupplierItemCode[]>([])
  const [aliases, setAliases] = useState<SupplierAlias[]>([])
  const [templates, setTemplates] = useState<SupplierTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newItemId, setNewItemId] = useState('')
  const [newSku, setNewSku] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [skuBusy, setSkuBusy] = useState(false)

  const [aliasText, setAliasText] = useState('')
  const [aliasItemId, setAliasItemId] = useState('')
  const [aliasBusy, setAliasBusy] = useState(false)

  const [learnOpen, setLearnOpen] = useState(false)
  const [sampleText, setSampleText] = useState('')
  const [sampleFile, setSampleFile] = useState('')
  const [sampleFileName, setSampleFileName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [promptBusy, setPromptBusy] = useState(false)
  const [templateJson, setTemplateJson] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateBusy, setTemplateBusy] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [copyDone, setCopyDone] = useState(false)

  useEffect(() => {
    setVenueId(venueIdProp ?? '')
  }, [venueIdProp, supplierId])

  useEffect(() => {
    if (venueId || !supplierId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/admin/suppliers')
        const body = await res.json().catch(() => [])
        if (cancelled || !res.ok || !Array.isArray(body)) return
        const supplier = body.find((row: { id: string }) => row.id === supplierId)
        if (supplier?.venueId) setVenueId(String(supplier.venueId))
      } catch {
        /* leave venue unset */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supplierId, venueId])

  const load = useCallback(async () => {
    if (!supplierId || !venueId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ supplierId, venueId })
    try {
      const [codeRes, aliasRes, templateRes, inventoryRes] = await Promise.all([
        fetch(`/api/admin/supplier-item-codes?${params.toString()}`),
        fetch(`/api/admin/supplier-aliases?${params.toString()}`),
        fetch(`/api/admin/supplier-templates?${params.toString()}`),
        fetch(`/api/admin/inventory?venueId=${encodeURIComponent(venueId)}`),
      ])
      if (codeRes.ok) {
        const body = await codeRes.json().catch(() => [])
        setCodes(Array.isArray(body) ? body : [])
      }
      if (aliasRes.ok) {
        const body = await aliasRes.json().catch(() => [])
        setAliases(Array.isArray(body) ? body : [])
      }
      if (templateRes.ok) {
        const body = await templateRes.json().catch(() => [])
        setTemplates(Array.isArray(body) ? body : [])
      }
      if (inventoryRes.ok) {
        const body = await inventoryRes.json().catch(() => [])
        if (Array.isArray(body)) {
          setItems(
            body.map((item: { id: string; name: string; unit?: string }) => ({
              id: item.id,
              name: item.name,
              unit: item.unit ?? 'EA',
            })),
          )
        }
      }
    } catch {
      setError('COULD NOT REACH THE SERVER')
    } finally {
      setLoading(false)
    }
  }, [supplierId, venueId])

  useEffect(() => {
    void load()
  }, [load])

  async function addCode() {
    if (!newItemId || !newSku.trim()) return
    setSkuBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/supplier-item-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId,
          supplierId,
          inventoryItemId: newItemId,
          supplierSku: newSku.trim(),
          purchasePrice: newPrice.trim() === '' ? null : Number(newPrice),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(String(body.error ?? 'COULD NOT SAVE THE SKU'))
        return
      }
      setNewItemId('')
      setNewSku('')
      setNewPrice('')
      await load()
    } catch {
      setError('COULD NOT REACH THE SERVER')
    } finally {
      setSkuBusy(false)
    }
  }

  async function removeCode(id: string) {
    const params = new URLSearchParams({ venueId })
    await fetch(`/api/admin/supplier-item-codes/${id}?${params.toString()}`, { method: 'DELETE' })
    await load()
  }

  async function addAlias() {
    if (!aliasText.trim() || !aliasItemId) return
    setAliasBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/supplier-aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, supplierId, text: aliasText.trim(), inventoryItemId: aliasItemId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(String(body.error ?? 'COULD NOT SAVE THE ALIAS'))
        return
      }
      setAliasText('')
      setAliasItemId('')
      await load()
    } catch {
      setError('COULD NOT REACH THE SERVER')
    } finally {
      setAliasBusy(false)
    }
  }

  async function removeAlias(id: string) {
    const params = new URLSearchParams({ venueId })
    await fetch(`/api/admin/supplier-aliases/${id}?${params.toString()}`, { method: 'DELETE' })
    await load()
  }

  function openLearn() {
    setSampleText('')
    setSampleFile('')
    setSampleFileName('')
    setPrompt('')
    setTemplateJson('')
    setTemplateName('')
    setTemplateError('')
    setCopyDone(false)
    setLearnOpen(true)
  }

  function handleSampleFile(file: File | null) {
    if (!file) {
      setSampleFile('')
      setSampleFileName('')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      setSampleFile(result.includes(',') ? result.split(',')[1] : result)
      setSampleFileName(file.name)
    }
    reader.readAsDataURL(file)
  }

  async function generatePrompt() {
    setPromptBusy(true)
    setTemplateError('')
    try {
      const payload = sampleFile
        ? { venueId, supplierId, fileBase64: sampleFile }
        : { venueId, supplierId, sampleText }
      const res = await fetch('/api/admin/supplier-templates/learn-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTemplateError(String(body.error ?? 'COULD NOT BUILD THE PROMPT'))
        return
      }
      setPrompt(String(body.prompt ?? ''))
    } catch {
      setTemplateError('COULD NOT REACH THE SERVER')
    } finally {
      setPromptBusy(false)
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 1500)
    } catch {
      setTemplateError('COPY FAILED — SELECT AND COPY MANUALLY')
    }
  }

  async function saveTemplate() {
    if (!templateName.trim()) {
      setTemplateError('TEMPLATE NAME IS REQUIRED')
      return
    }
    let config: unknown
    try {
      config = JSON.parse(templateJson)
    } catch {
      setTemplateError('THE PASTED TEMPLATE IS NOT VALID JSON')
      return
    }
    setTemplateBusy(true)
    setTemplateError('')
    try {
      const res = await fetch('/api/admin/supplier-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, supplierId, name: templateName.trim(), config }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const details = Array.isArray(body.details) ? `: ${body.details.join('; ')}` : ''
        setTemplateError(`${String(body.error ?? 'COULD NOT SAVE THE TEMPLATE')}${details}`)
        return
      }
      setLearnOpen(false)
      await load()
    } catch {
      setTemplateError('COULD NOT REACH THE SERVER')
    } finally {
      setTemplateBusy(false)
    }
  }

  const itemOptions = items.map((item) => ({ value: item.id, label: `${item.name} · ${item.unit}` }))

  return (
    <div className="space-y-4">
      {error && <p className="font-mono text-xs text-danger border border-danger p-2">{error}</p>}

      <section className="border border-grey-mid p-3 space-y-3">
        <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">SUPPLIER SKUs</h3>
        {loading && <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>}
        <div className="space-y-1">
          {codes.map((code) => (
            <div key={code.id} className="flex items-center justify-between gap-2 border-b border-grey-mid last:border-b-0 py-1">
              <div className="min-w-0">
                <div className="font-mono text-xs text-white truncate">
                  {code.supplierSku}
                  <span className="text-grey-light"> · {code.inventoryItem?.name ?? 'ITEM REMOVED'}</span>
                </div>
                <div className="font-mono text-2xs uppercase text-grey-light">
                  {code.purchasePrice == null ? 'NO PRICE' : `$${code.purchasePrice.toFixed(2)}`}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void removeCode(code.id)}>
                REMOVE
              </Button>
            </div>
          ))}
          {!loading && codes.length === 0 && (
            <p className="font-mono text-2xs uppercase text-grey-light">NO SKUs YET.</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div className="sm:col-span-2">
            <Select
              label="ITEM"
              aria-label="SKU ITEM"
              value={newItemId}
              onChange={(e) => setNewItemId(e.target.value)}
              options={itemOptions}
              placeholder="CHOOSE ITEM"
            />
          </div>
          <Input
            label="SKU"
            aria-label="SKU CODE"
            value={newSku}
            onChange={(e) => setNewSku(e.target.value)}
          />
          <Input
            label="PRICE"
            aria-label="SKU PRICE"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            className="text-right"
          />
        </div>
        <Button size="sm" variant="ghost" onClick={() => void addCode()} loading={skuBusy} disabled={!newItemId || !newSku.trim()}>
          + ADD SKU
        </Button>
      </section>

      <section className="border border-grey-mid p-3 space-y-3">
        <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">LINE ALIASES</h3>
        <div className="space-y-1">
          {aliases.map((alias) => (
            <div key={alias.id} className="flex items-center justify-between gap-2 border-b border-grey-mid last:border-b-0 py-1">
              <div className="min-w-0">
                <div className="font-mono text-xs text-white truncate">{alias.normalisedTextKey}</div>
                <div className="font-mono text-2xs uppercase text-grey-light">
                  → {alias.inventoryItem?.name ?? 'ITEM REMOVED'} · {alias.source}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void removeAlias(alias.id)}>
                REMOVE
              </Button>
            </div>
          ))}
          {!loading && aliases.length === 0 && (
            <p className="font-mono text-2xs uppercase text-grey-light">NO ALIASES YET.</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div className="sm:col-span-2">
            <Input
              label="INVOICE TEXT"
              aria-label="ALIAS TEXT"
              value={aliasText}
              onChange={(e) => setAliasText(e.target.value)}
              placeholder="AS PRINTED ON THE INVOICE"
            />
          </div>
          <div className="sm:col-span-2">
            <Select
              label="ITEM"
              aria-label="ALIAS ITEM"
              value={aliasItemId}
              onChange={(e) => setAliasItemId(e.target.value)}
              options={itemOptions}
              placeholder="CHOOSE ITEM"
            />
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void addAlias()}
          loading={aliasBusy}
          disabled={!aliasText.trim() || !aliasItemId}
        >
          + ADD ALIAS
        </Button>
      </section>

      <section className="border border-grey-mid p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">INVOICE TEMPLATES</h3>
          <Button size="sm" variant="ghost" onClick={openLearn}>
            LEARN TEMPLATE
          </Button>
        </div>
        <div className="space-y-1">
          {templates.map((template) => (
            <div key={template.id} className="flex items-center justify-between gap-2 border-b border-grey-mid last:border-b-0 py-1">
              <div>
                <div className="font-mono text-xs text-white">{template.name}</div>
                <div className="font-mono text-2xs uppercase text-grey-light">
                  V{template.version} · {template.status}
                </div>
              </div>
            </div>
          ))}
          {!loading && templates.length === 0 && (
            <p className="font-mono text-2xs uppercase text-grey-light">
              NO TEMPLATES YET — LEARN ONE FROM A SAMPLE INVOICE.
            </p>
          )}
        </div>
      </section>

      <Modal
        isOpen={learnOpen}
        onClose={() => setLearnOpen(false)}
        title="LEARN INVOICE TEMPLATE"
        size="lg"
        dirty={Boolean(sampleText || sampleFile || templateJson || templateName)}
      >
        <div className="space-y-4">
          <p className="font-mono text-2xs uppercase text-grey-light leading-tight">
            1. PASTE A SAMPLE INVOICE (OR UPLOAD A PDF). 2. COPY THE BUILT PROMPT INTO AN EXTERNAL LLM.
            3. PASTE ITS JSON ANSWER BACK HERE AND SAVE — IMPORTING IS THEN FULLY OFFLINE.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Textarea
              label="SAMPLE INVOICE TEXT"
              aria-label="SAMPLE INVOICE TEXT"
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              className="min-h-[6rem]"
            />
            <div className="space-y-1">
              <label className="font-mono text-xs uppercase text-grey-light">SAMPLE PDF</label>
              <input
                type="file"
                accept="application/pdf"
                aria-label="SAMPLE PDF"
                onChange={(e) => handleSampleFile(e.target.files?.[0] ?? null)}
                className="font-mono text-xs text-white"
              />
              {sampleFileName && (
                <p className="font-mono text-2xs uppercase text-grey-light">{sampleFileName} READY</p>
              )}
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => void generatePrompt()}
            loading={promptBusy}
            disabled={!sampleFile && !sampleText.trim()}
          >
            BUILD PROMPT
          </Button>

          {prompt && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-mono text-xs uppercase text-grey-light tracking-wider">PROMPT</h4>
                <Button size="sm" variant="ghost" onClick={() => void copyPrompt()}>
                  {copyDone ? 'COPIED' : 'COPY PROMPT'}
                </Button>
              </div>
              <Textarea
                aria-label="LEARN PROMPT"
                value={prompt}
                readOnly
                className="min-h-[8rem]"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="TEMPLATE NAME"
              aria-label="TEMPLATE NAME"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="sm:col-span-1"
            />
            <div className="sm:col-span-2">
              <Textarea
                label="PASTED JSON TEMPLATE"
                aria-label="TEMPLATE JSON"
                value={templateJson}
                onChange={(e) => setTemplateJson(e.target.value)}
                className="min-h-[6rem]"
              />
            </div>
          </div>

          {templateError && (
            <p className="font-mono text-xs text-danger border border-danger p-2">{templateError}</p>
          )}

          <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
            <Button
              onClick={() => void saveTemplate()}
              loading={templateBusy}
              disabled={!templateName.trim() || !templateJson.trim()}
            >
              SAVE TEMPLATE
            </Button>
            <Button variant="ghost" onClick={() => setLearnOpen(false)}>
              CANCEL
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
