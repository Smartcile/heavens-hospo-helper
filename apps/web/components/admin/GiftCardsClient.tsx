'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ImagePicker } from '@/components/ui/ImagePicker'
import { GiftCardModal } from '@/components/admin/GiftCardModal'
import { IssueGiftCardModal } from '@/components/admin/IssueGiftCardModal'

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

interface PendingGiftOrder {
  wooOrderId: string
  number: string | null
  status: string
  createdAt: string
  customerName: string | null
  totalAmount: number
  paymentMethodTitle: string | null
  giftTotal: number
  giftQty: number
  giftLines: { name: string; qty: number; unitPrice: number }[]
}

interface GiftCatOrder {
  id: string
  wooOrderId: string
  orderNumber: string | null
  status: string | null
  opStatus: string | null
  paymentStatus: string | null
  customerName: string | null
  totalAmount: number | null
  createdAt: string
  serviceDate: string | null
  serviceTime: string | null
  lines: { productName: string | null; qty: number; unitPrice: number }[]
  giftQty: number
  giftTotal: number
  cards: { id: string; number: string; status: string }[]
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

interface GiftCardProduct {
  id: string
  name: string
  price: number
  wooProductId: string | null
  wooCategoryId: string | null
  imageUrl: string | null
  shortDescription: string | null
  isVariable: boolean
  variations: { name: string; price: number; wooVariationId?: string }[] | null
  createdAt: string
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
  ISSUED: 'text-[#60A5FA]',
  SENT: 'text-[#FACC15]',
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
  const [syncingOrders, setSyncingOrders] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncError, setSyncError] = useState('')

  // Unpaid store orders with gift-card lines, awaiting confirmation.
  const [pendingOrders, setPendingOrders] = useState<PendingGiftOrder[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [pendingError, setPendingError] = useState('')

  // All synced gift-category orders (breakdown + card linkage) — ORDERS tab.
  const [giftOrders, setGiftOrders] = useState<GiftCatOrder[]>([])
  const [view, setView] = useState<'cards' | 'orders'>('cards')
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

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

  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState<string | null>(null)
  const [hasIntegration, setHasIntegration] = useState(false)
  const [storeCategories, setStoreCategories] = useState<{ id: number; name: string }[]>([])
  const [categoryChoice, setCategoryChoice] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState('')

  // Gift card products — created from this page, hidden from the food areas.
  const [products, setProducts] = useState<GiftCardProduct[]>([])
  const [productName, setProductName] = useState('')
  const [productShortDesc, setProductShortDesc] = useState('')
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null)
  const [productError, setProductError] = useState('')
  const [savingProduct, setSavingProduct] = useState(false)
  // Variable product editor (one variable product per venue).
  const [denoms, setDenoms] = useState<string[]>([])
  const [productDirty, setProductDirty] = useState(false)
  const [savingDenoms, setSavingDenoms] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (search) params.set('search', search)
    if (yearFilter) params.set('year', yearFilter)
    const [cardsRes, templatesRes, settingsRes, catsRes, productsRes, pendingRes, ordersRes, nextRes] = await Promise.all([
      fetch(`/api/admin/gift-cards?${params}`),
      fetch('/api/admin/gift-card-templates'),
      fetch('/api/admin/gift-cards/settings'),
      fetch('/api/admin/woocommerce/categories'),
      fetch('/api/admin/gift-cards/products'),
      fetch('/api/admin/gift-cards/pending-orders'),
      fetch('/api/admin/gift-cards/orders'),
      fetch('/api/admin/gift-cards/next-number'),
    ])
    if (cardsRes.ok) setCards(await cardsRes.json())
    if (templatesRes.ok) setTemplates(await templatesRes.json())
    if (nextRes.ok) {
      const d = await nextRes.json()
      setNextDraft(d?.draft ?? null)
    }
    if (settingsRes.ok) {
      const s = await settingsRes.json()
      setCategoryId(s.giftCardCategoryId ?? null)
      setCategoryName(s.giftCardCategoryName ?? null)
      setHasIntegration(!!s.hasIntegration)
      setCategoryChoice(s.giftCardCategoryId ? String(s.giftCardCategoryId) : '')
    }
    if (catsRes.ok) {
      const c = await catsRes.json()
      setStoreCategories(c.categories ?? [])
    }
    if (productsRes.ok) {
      const p = await productsRes.json()
      if (Array.isArray(p)) setProducts(p)
    }
    if (pendingRes.ok) {
      const d = await pendingRes.json()
      if (d?.orders) setPendingOrders(d.orders)
    }
    if (ordersRes.ok) {
      const d = await ordersRes.json()
      if (d?.orders) setGiftOrders(d.orders)
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
  const variableProduct = products.find((p) => p.isVariable) ?? null

  // Denomination editor tracks the venue's variable product; reset the draft
  // whenever a (different) product becomes the editable one.
  useEffect(() => {
    setDenoms((variableProduct?.variations ?? []).map((v) => String(v.price)))
    setProductName(variableProduct?.name ?? '')
    setProductShortDesc(variableProduct?.shortDescription ?? '')
    setProductImageUrl(variableProduct?.imageUrl ?? null)
    setProductDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variableProduct?.id])

  async function handleCreateBlank() {
    setSaving(true)
    const r = await fetch('/api/admin/gift-cards', { method: 'POST' })
    if (r.ok) load()
    setSaving(false)
  }

  async function handleSyncOrders() {
    setSyncingOrders(true)
    setSyncMessage('')
    setSyncError('')
    // Order pull only — gift cards (and the orders that carry them) are
    // created/issued from this; products, menus and categories stay untouched.
    const r = await fetch('/api/admin/sync/pull-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setSyncingOrders(false)
    if (r.ok) {
      const d = await r.json().catch(() => null)
      setSyncMessage(d?.message ?? 'ORDERS SYNCED')
      load()
    } else {
      const d = await r.json().catch(() => null)
      setSyncError(d?.error ?? 'SYNC FAILED')
    }
  }

  async function refreshPending() {
    setPendingLoading(true)
    const r = await fetch('/api/admin/gift-cards/pending-orders')
    if (r.ok) {
      const d = await r.json()
      if (d?.orders) setPendingOrders(d.orders)
    }
    setPendingLoading(false)
  }

  async function handleConfirmPayment(order: PendingGiftOrder) {
    const label = order.number ? `#${order.number}` : `#${order.wooOrderId}`
    if (!window.confirm(`CONFIRM PAYMENT FOR ORDER ${label}?\n\nTHIS MARKS THE ORDER PAID AND ISSUES ITS GIFT CARD ($${(order.giftTotal ?? 0).toFixed(2)}).`)) return
    setConfirmingId(order.wooOrderId)
    setPendingError('')
    const r = await fetch(`/api/admin/gift-cards/pending-orders/${order.wooOrderId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setConfirmingId(null)
    if (r.ok) {
      load()
    } else {
      const d = await r.json().catch(() => null)
      setPendingError(d?.error ?? 'CONFIRM FAILED')
      refreshPending()
    }
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

  async function handleSaveCategory() {
    setCategoryError('')
    setSavingCategory(true)
    const r = await fetch('/api/admin/gift-cards/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: categoryChoice }),
    })
    if (r.ok) {
      const s = await r.json()
      setCategoryId(s.giftCardCategoryId ?? null)
      setCategoryName(s.giftCardCategoryName ?? null)
      setCategoryChoice(s.giftCardCategoryId ? String(s.giftCardCategoryId) : '')
      load()
    } else {
      const err = await r.json().catch(() => null)
      setCategoryError(err?.error ?? 'Save failed')
    }
    setSavingCategory(false)
  }

  async function handleCreateProduct() {
    setProductError('')
    setSavingProduct(true)
    const r = await fetch('/api/admin/gift-cards/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: productName || null }),
    })
    if (r.ok) {
      const d = await r.json()
      setProductName('')
      if (d.category?.id) {
        setCategoryId(String(d.category.id))
        setCategoryName(d.category.name ?? null)
        setCategoryChoice(String(d.category.id))
      }
      if (!d.synced && d.syncError) setProductError(`PRODUCT CREATED — ${d.syncError}`)
      load()
    } else {
      const err = await r.json().catch(() => null)
      setProductError(err?.error ?? 'CREATE FAILED')
    }
    setSavingProduct(false)
  }

  async function handleSaveDenoms() {
    if (!variableProduct) return
    const name = productName.trim()
    if (!name) { setProductError('PRODUCT NAME IS REQUIRED'); return }
    const nums = denoms.map((d) => Number(d)).filter((n) => Number.isFinite(n) && n > 0)
    if (nums.length === 0 || nums.length > 20) { setProductError('ENTER 1-20 DENOMINATIONS'); return }
    setProductError('')
    setSavingDenoms(true)
    const r = await fetch(`/api/admin/gift-cards/products/${variableProduct.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, shortDescription: productShortDesc, imageUrl: productImageUrl, denominations: nums }),
    })
    if (r.ok) {
      const d = await r.json()
      if (d.product) setProducts((prev) => prev.map((p) => (p.id === d.product.id ? d.product : p)))
      const updated = (d.product?.variations ?? nums.map((n) => ({ price: n })))
        .map((v: { price: number }) => String(v.price))
      setDenoms(updated)
      setProductDirty(false)
      if (!d.synced) setProductError(d.syncError ?? 'STORE SYNC INCOMPLETE')
    } else {
      const err = await r.json().catch(() => null)
      setProductError(err?.error ?? 'SAVE FAILED')
    }
    setSavingDenoms(false)
  }

  async function handleDeleteProduct(p: GiftCardProduct) {
    if (!window.confirm(`DELETE "${p.name}"?\n\nTHE PRODUCT IS REMOVED FROM THE STORE (DRAFT, UNCATEGORISED) AND FROM THIS LIST.`)) return
    setProductError('')
    const r = await fetch(`/api/admin/gift-cards/products/${p.id}`, { method: 'DELETE' })
    if (r.ok) {
      load()
    } else {
      const err = await r.json().catch(() => null)
      setProductError(err?.error ?? 'DELETE FAILED')
    }
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
        <div className="flex border border-grey-mid">
          <button onClick={() => setView('cards')} className={`font-mono text-xs uppercase px-4 py-2 tracking-wider transition-colors ${view === 'cards' ? 'bg-white text-black' : 'text-grey-light hover:text-white'}`}>
            CARDS ({cards.length})
          </button>
          <button onClick={() => setView('orders')} className={`font-mono text-xs uppercase px-4 py-2 tracking-wider transition-colors ${view === 'orders' ? 'bg-white text-black' : 'text-grey-light hover:text-white'}`}>
            GIFT ORDERS ({giftOrders.length})
          </button>
        </div>
      </div>

      {view === 'orders' ? (
        <div className="border border-grey-mid p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">GIFT-CATEGORY ORDERS</h2>
              <p className="font-mono text-[9px] text-grey-light/60">EVERY SYNCED ORDER WITH GIFT-CARD LINES — LINE BREAKDOWN, STATUSES AND THE CARD(S) EACH ORDER LINKED TO.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { load(); }}>↻ REFRESH</Button>
          </div>
          {giftOrders.length === 0 ? (
            <p className="font-mono text-[10px] text-grey-light uppercase">NO SYNCED GIFT ORDERS YET</p>
          ) : (
            <div className="border border-grey-mid divide-y divide-grey-mid max-h-[70vh] overflow-y-auto">
              {giftOrders.map((o) => {
                const open = expandedOrderId === o.id
                const statusColour = o.paymentStatus === 'PAID' ? 'text-success' : 'text-[#FACC15]'
                return (
                  <div key={o.id} className={open ? 'bg-grey-dark/40' : ''}>
                    <button onClick={() => setExpandedOrderId(open ? null : o.id)} className="w-full text-left px-3 py-2 hover:bg-grey-dark/40 transition-colors">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-white">WOO #{o.orderNumber ?? o.wooOrderId}</span>
                        <span className={`font-mono text-[10px] uppercase ${statusColour}`}>{o.paymentStatus ?? '—'}</span>
                        <span className="font-mono text-[10px] uppercase text-grey-light">{o.status ?? ''} · {o.opStatus ?? ''}</span>
                        {o.cards.map((c) => (
                          <span key={c.id} className="font-mono text-[10px] uppercase border border-[#60A5FA]/60 text-[#60A5FA] px-1.5 py-0.5">{c.number} · {c.status}</span>
                        ))}
                        <span className="ml-auto font-mono text-xs text-white shrink-0">
                          ${(o.giftTotal ?? 0).toFixed(2)} ({o.giftQty} CARD{o.giftQty === 1 ? '' : 'S'})
                        </span>
                        <span className="font-mono text-[10px] text-grey-light/60 shrink-0">{open ? '▾' : '▸'}</span>
                      </div>
                    </button>
                    {open && (
                      <div className="px-4 pb-3 space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
                          <div><div className="font-mono text-[9px] uppercase text-grey-light">ORDERED</div><div className="font-mono text-[11px] text-white">{String(o.createdAt).slice(0, 10)}</div></div>
                          <div><div className="font-mono text-[9px] uppercase text-grey-light">CUSTOMER</div><div className="font-mono text-[11px] text-white truncate">{o.customerName ?? '—'}</div></div>
                          <div><div className="font-mono text-[9px] uppercase text-grey-light">ORDER TOTAL</div><div className="font-mono text-[11px] text-white">{o.totalAmount != null ? `$${o.totalAmount.toFixed(2)}` : '—'}</div></div>
                          <div><div className="font-mono text-[9px] uppercase text-grey-light">SERVICE</div><div className="font-mono text-[11px] text-white">{o.serviceDate ? `${o.serviceDate} ${o.serviceTime ?? ''}` : '—'}</div></div>
                        </div>
                        <div className="border border-grey-mid divide-y divide-grey-mid/60">
                          <div className="px-2 py-1 grid grid-cols-[1fr_auto_auto] gap-3 font-mono text-[9px] uppercase text-grey-light">
                            <span>GIFT LINE</span><span className="w-14 text-right">QTY</span><span className="w-16 text-right">TOTAL</span>
                          </div>
                          {o.lines.map((l, i) => (
                            <div key={i} className="px-2 py-1 grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                              <span className="font-mono text-[11px] text-white truncate">{l.productName ?? 'GIFT CARD'}</span>
                              <span className="w-14 text-right font-mono text-[11px] text-grey-light">×{l.qty}</span>
                              <span className="w-16 text-right font-mono text-[11px] text-white">${((l.qty ?? 0) * (l.unitPrice ?? 0)).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {o.cards.map((c) => (
                            <span key={c.id} className="inline-flex items-center gap-2 border border-grey-mid px-2 py-1">
                              <span className="font-mono text-[11px] text-white">{c.number}</span>
                              <span className="font-mono text-[9px] uppercase text-grey-light">{c.status}</span>
                              <button onClick={() => setOpenCardId(c.id)} className="font-mono text-[10px] uppercase text-[#60A5FA] hover:text-white">OPEN</button>
                            </span>
                          ))}
                          {o.cards.length === 0 && (
                            <span className="font-mono text-[10px] text-grey-light uppercase">NO CARD LINKED — ORDER NOT YET PAID/CONFIRMED</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column — Issue */}
        <div className="lg:col-span-4 space-y-4">

          {/* Issue Box */}
          <div className="border border-grey-mid p-4 space-y-4">
            <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
              ISSUE GIFT CARD {draftCount > 0 && <span className="text-white">({draftCount} AVAILABLE)</span>}
            </h2>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm text-white">NEXT CARD: {nextDraft?.number ?? '—'}</span>
              {activeTemplate && (
                <span className="font-mono text-[10px] uppercase border border-[#60A5FA] text-[#60A5FA] px-1.5 py-0.5">
                  TEMPLATE: {activeTemplate.name}
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] text-grey-light leading-relaxed">
              OPENS THE ISSUE POPUP — CUSTOMER DETAILS, AMOUNT, MESSAGE AND A PREVIEW OF THE CARD DESIGN BEFORE CONFIRMING.
              {!nextDraft && ' NO BLANK CARDS EXIST — ONE WILL BE PREMADE AUTOMATICALLY WHEN YOU ISSUE.'}
            </p>
            <div className="border-t border-grey-mid pt-3">
              <Button size="sm" onClick={() => setIssueOpen(true)}>
                ISSUE GIFT CARD
              </Button>
            </div>
          </div>

          {/* Issue popup */}
          {issueOpen && (
            <IssueGiftCardModal
              cardId={nextDraft?.id ?? null}
              cardNumber={nextDraft?.number ?? '—'}
              templatePreviewUrl={activeTemplate?.filePath ? `/api/admin/gift-card-templates/${activeTemplate.id}/preview` : null}
              onClose={() => setIssueOpen(false)}
              onIssued={() => { setIssueOpen(false); load() }}
            />
          )}

          {/* Pending payment orders — cash on delivery awaiting confirmation */}
          <div className="border border-grey-mid p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                PENDING PAYMENT ORDERS
              </h2>
              <div className="flex items-center gap-2">
                {pendingOrders.length > 0 && (
                  <span className="font-mono text-[10px] text-[#FACC15]">{pendingOrders.length} AWAITING CONFIRMATION</span>
                )}
                <button onClick={refreshPending} disabled={pendingLoading} className="font-mono text-[10px] uppercase border border-grey-mid px-2 py-1 text-grey-light hover:text-white hover:border-white disabled:opacity-40">
                  {pendingLoading ? 'REFRESHING...' : '↻ REFRESH'}
                </button>
              </div>
            </div>
            {pendingOrders.length === 0 ? (
              <p className="font-mono text-[10px] text-grey-light uppercase">NONE — ALL GIFT ORDERS PAID</p>
            ) : (
              <div className="border border-grey-mid divide-y divide-grey-mid max-h-[280px] overflow-y-auto">
                {pendingOrders.map((o) => (
                  <div key={o.wooOrderId} className="px-2 py-2 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-white">WOO #{o.number ?? o.wooOrderId}</span>
                      <span className="font-mono text-[10px] uppercase text-[#FACC15] border border-[#FACC15]/50 px-1 py-0.5">
                        {String(o.status ?? '').toUpperCase().replace('-', ' ')} · UNPAID
                      </span>
                      <span className="ml-auto font-mono text-xs text-white shrink-0">
                        ${(o.giftTotal ?? 0).toFixed(2)} {o.giftQty > 0 && <span className="text-grey-light">({o.giftQty} CARD{o.giftQty === 1 ? '' : 'S'})</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-grey-light truncate min-w-0 flex-1">
                        {o.customerName ?? '—'} · {String(o.createdAt).slice(0, 10)}{o.paymentMethodTitle ? ` · ${o.paymentMethodTitle}` : ''}
                      </span>
                      <Button size="sm" onClick={() => handleConfirmPayment(o)} disabled={confirmingId === o.wooOrderId}>
                        {confirmingId === o.wooOrderId ? 'CONFIRMING...' : 'CONFIRM PAYMENT'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {pendingError && <p className="font-mono text-[10px] text-danger">{pendingError}</p>}
            <p className="font-mono text-[9px] text-grey-light/60 leading-relaxed">
              LOADED LIVE FROM THE STORE — CASH ORDERS SIT HERE UNTIL YOU PRESS CONFIRM PAYMENT, WHICH RECORDS THE PAYMENT AND ISSUES THE GIFT CARD.
            </p>
          </div>

          {/* Template Box */}
          <div className="border border-grey-mid p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                GIFT CARD TEMPLATE
              </h2>
              {activeTemplate && (
                <span className="font-mono text-[10px] uppercase text-[#60A5FA]">
                  ACTIVE: {activeTemplate.name}
                </span>
              )}
            </div>

            {templates.map((t) => (
              <div key={t.id} className="border border-grey-mid p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-white truncate">{t.name}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {t.isActive && (
                      <span className="font-mono text-[10px] uppercase border border-[#60A5FA] text-[#60A5FA] px-1.5 py-0.5">ACTIVE</span>
                    )}
                    {!t.filePath && (
                      <span className="font-mono text-[10px] uppercase border border-[#FACC15] text-[#FACC15] px-1.5 py-0.5" title="THE PDF WAS REMOVED — NEW CARDS USE THE BUILT-IN DESIGN">NO FILE</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Button size="sm" variant="ghost" onClick={() => openMapping(t)} disabled={!t.filePath}>MAPPING</Button>
                  <Button size="sm" variant="ghost" onClick={() => window.open(`/api/admin/gift-card-templates/${t.id}/preview`, '_blank')} disabled={!t.filePath}>PREVIEW</Button>
                  {!t.isActive && (
                    <Button size="sm" variant="ghost" onClick={() => setActive(t)}>SET ACTIVE</Button>
                  )}
                  <label className="font-mono text-[10px] uppercase border border-grey-mid px-2 py-1.5 text-grey-light hover:text-white hover:border-white transition-colors cursor-pointer" title="UPLOAD A NEW PDF ONTO THIS TEMPLATE — KEEPS NAME, MAPPING (ADAPTED TO THE NEW FIELDS) AND ACTIVE STATE">
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
              </div>
            ))}

            <div className="border-t border-grey-mid pt-3 space-y-2">
              <h3 className="font-mono text-[10px] uppercase text-grey-light tracking-wider">UPLOAD PDF TEMPLATE</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="TEMPLATE NAME" />
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)}
                  className="font-mono text-[10px] text-grey-light file:mr-2 file:px-2 file:py-1 file:bg-grey-dark file:border file:border-grey-mid file:text-white file:font-mono file:text-[10px] file:uppercase file:cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleUpload} disabled={uploading || !templateFile}>
                  {uploading ? 'UPLOADING' : 'UPLOAD TEMPLATE'}
                </Button>
                {templateFile && (
                  <span className="font-mono text-[10px] text-grey-light truncate">{templateFile.name}</span>
                )}
              </div>
              {templateError && <p className="font-mono text-xs text-danger">{templateError}</p>}
              <p className="font-mono text-[10px] text-grey-light leading-relaxed">
                PDF MUST CONTAIN FILLABLE FORM FIELDS. AFTER UPLOAD, MAP EACH FIELD TO A GIFT CARD VALUE.
              </p>
            </div>
          </div>

          {/* WooCommerce Sync Box */}
          <div className="border border-grey-mid p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                WOOCOMMERCE SYNC
              </h2>
              {categoryId ? (
                <span className="font-mono text-[10px] uppercase border border-[#60A5FA] text-[#60A5FA] px-1.5 py-0.5">
                  CAT: {categoryName || categoryId}
                </span>
              ) : (
                <span className="font-mono text-[10px] uppercase text-grey-light">UNLINKED</span>
              )}
            </div>

            {!hasIntegration && (
              <p className="font-mono text-[10px] text-[#FACC15] uppercase leading-relaxed">
                NO ACTIVE WOOCOMMERCE INTEGRATION — LINK A CATEGORY IN SETTINGS → WOOCOMMERCE FIRST
              </p>
            )}

            <div>
              <label htmlFor="gift-card-category" className="font-mono text-xs uppercase text-grey-light block mb-1">GIFT CARD CATEGORY</label>
              <select
                id="gift-card-category"
                value={categoryChoice}
                onChange={(e) => setCategoryChoice(e.target.value)}
                disabled={!hasIntegration}
                className="bg-grey-dark border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white w-full disabled:opacity-40"
              >
                <option value="">NO CATEGORY — LOCAL ONLY</option>
                <option value="__new__">CREATE NEW CATEGORY (GIFT CARDS)</option>
                {storeCategories.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={handleSaveCategory} disabled={savingCategory || !hasIntegration}>
                {savingCategory ? 'SAVING' : 'SAVE LINK'}
              </Button>
              {hasIntegration && (
                <Button size="sm" variant="ghost" onClick={handleSyncOrders} disabled={syncingOrders} title="PULLS ORDERS FROM THE STORE — GIFT CARDS ON THEM ARE AUTO-CREATED + ISSUED. PRODUCTS, MENUS AND CATEGORIES ARE LEFT ALONE.">
                  {syncingOrders ? 'SYNCING...' : 'SYNC WOOCOMMERCE (GIFT CARDS + ORDERS)'}
                </Button>
              )}
            </div>
            {syncMessage && <p className="font-mono text-[10px] text-success">{syncMessage}</p>}
            {syncError && <p className="font-mono text-[10px] text-danger">{syncError}</p>}
            {categoryError && <p className="font-mono text-xs text-danger">{categoryError}</p>}

            {/* Gift card products — created here, hidden from the food areas */}
            {categoryId && hasIntegration && (
              <div className="border-t border-grey-mid pt-3 space-y-3">
                <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">GIFT CARD PRODUCT</h3>
                <p className="font-mono text-[9px] text-grey-light leading-relaxed">
                  ONE VARIABLE PRODUCT IN THE {categoryName ? `${categoryName} ` : ''}CATEGORY — ITS DENOMINATIONS ARE PICKED AT STORE CHECKOUT. HIDDEN FROM RECIPES, MENUS AND ORDER PICKERS; THIS PAGE OWNS IT.
                </p>

                {products.length > 0 && (
                  <div className="border border-grey-mid divide-y divide-grey-mid">
                    {products.map((p) => (
                      <div key={p.id} className="px-2 py-1.5 flex items-center gap-2">
                        <span className="font-mono text-xs text-white truncate">{p.name}</span>
                        {p.isVariable ? (
                          <>
                            <span className="font-mono text-[9px] uppercase border border-[#60A5FA]/60 text-[#60A5FA] px-1 py-0.5 shrink-0">
                              VARIABLE · {(p.variations ?? []).length} DENOMINATION{(p.variations ?? []).length === 1 ? '' : 'S'}
                            </span>
                            <span className="font-mono text-[9px] text-grey-light shrink-0">
                              {(p.variations ?? []).map((v) => v.name).join(' / ')}
                            </span>
                          </>
                        ) : (
                          <span className="font-mono text-[9px] uppercase border border-[#FACC15]/60 text-[#FACC15] px-1 py-0.5 shrink-0">SIMPLE — LEGACY</span>
                        )}
                        {p.wooProductId && (
                          <span className="font-mono text-[9px] uppercase text-[#60A5FA] border border-[#60A5FA]/50 px-1 py-0.5 shrink-0">WOO #{p.wooProductId}</span>
                        )}
                        <button
                          onClick={() => handleDeleteProduct(p)}
                          title={`DELETE ${p.name}`}
                          className="ml-auto font-mono text-[10px] text-grey-light hover:text-danger shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {variableProduct ? (
                  <div className="border border-grey-mid p-2.5 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="font-mono text-[9px] uppercase text-grey-light block mb-1">PRODUCT NAME</label>
                        <Input value={productName} onChange={(e) => { setProductName(e.target.value); setProductDirty(true) }} />
                      </div>
                      <div>
                        <label className="font-mono text-[9px] uppercase text-grey-light block mb-1">SHORT DESCRIPTION (STORE EXCERPT)</label>
                        <Input value={productShortDesc} onChange={(e) => { setProductShortDesc(e.target.value); setProductDirty(true) }} />
                      </div>
                    </div>
                    <ImagePicker
                      label="PRODUCT IMAGE"
                      value={productImageUrl}
                      onChange={(url) => { setProductImageUrl(url); setProductDirty(true) }}
                    />
                    <p className="font-mono text-[9px] uppercase text-grey-light border-t border-grey-mid pt-2">DENOMINATIONS — BUYER PICKS ONE AT CHECKOUT</p>
                    {denoms.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="font-mono text-xs text-grey-light">$</span>
                        <Input
                          type="number"
                          value={d}
                          onChange={(e) => {
                            const next = [...denoms]
                            next[i] = e.target.value
                            setDenoms(next)
                            setProductDirty(true)
                          }}
                          className="text-right w-28"
                        />
                        <span className="font-mono text-[10px] text-grey-light truncate">→ {d ? `$${d}` : '—'}</span>
                        <button
                          onClick={() => { setDenoms(denoms.filter((_, j) => j !== i)); setProductDirty(true) }}
                          title="REMOVE DENOMINATION"
                          className="ml-auto font-mono text-[10px] text-grey-light hover:text-danger"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost"
                        onClick={() => {
                          const last = Number(denoms[denoms.length - 1]) || 0
                          setDenoms([...denoms, String(last + 50 || 50)])
                          setProductDirty(true)
                        }}>
                        + ADD DENOMINATION
                      </Button>
                      <Button size="sm" onClick={handleSaveDenoms} disabled={savingDenoms || !productDirty || denoms.length === 0}>
                        {savingDenoms ? 'SYNCING' : 'SAVE PRODUCT CHANGES'}
                      </Button>
                      {!productDirty && <span className="font-mono text-[9px] uppercase text-success">SYNCED</span>}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="font-mono text-[10px] text-grey-light uppercase">NO GIFT CARD PRODUCT YET — CREATE ONE (STARTS AT $50 / $100 / $150, EDIT AFTER)</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="PRODUCT NAME (DEFAULT: GIFT CARD)" className="flex-1 min-w-[220px]" />
                      <Button size="sm" onClick={handleCreateProduct} disabled={savingProduct}>
                        {savingProduct ? 'CREATING' : '+ CREATE GIFT CARD PRODUCT'}
                      </Button>
                    </div>
                  </div>
                )}
                {productError && <p className="font-mono text-xs text-danger">{productError}</p>}
              </div>
            )}
            <p className="font-mono text-[10px] text-grey-light leading-relaxed">
              PRODUCTS IN THIS CATEGORY AUTO-CREATE + ISSUE GIFT CARDS ON ORDER SYNC, AND THE STORE ORDER EMAILS CARRY THE PDF AUTOMATICALLY.
            </p>
          </div>
        </div>

        {/* Right Column — Cards List */}
        <div className="lg:col-span-8">
          <div className="border border-grey-mid p-4">
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
                      <div className="absolute right-0 mt-1 z-50 border border-grey-mid bg-grey-dark shadow-xl min-w-[150px]">
                        <button
                          onClick={() => handleCreateChosen('single')}
                          disabled={saving}
                          className="w-full text-left px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-grey-light hover:text-white hover:bg-black/40 disabled:opacity-40"
                        >
                          + SINGLE
                        </button>
                        <button
                          onClick={() => handleCreateChosen('bulk')}
                          className="w-full text-left px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-grey-light hover:text-white hover:bg-black/40"
                        >
                          BULK
                        </button>
                      </div>
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
                          <span className="font-mono text-[10px] uppercase text-[#60A5FA]">WOO #{c.wooOrderNumber}</span>
                        )}
                        <span className={`font-mono text-xs border px-1.5 py-0.5 ${c.amount === 0 ? 'border-[#FACC15] text-[#FACC15]' : 'border-danger text-danger'}`}>
                          ${c.amount.toFixed(2)}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center justify-between mt-0.5">
                      <span className={`font-mono text-[10px] uppercase ${STATUS_COLORS[c.status] || 'text-grey-light'}`}>
                        {c.status}
                      </span>
                      <span className="font-sans text-[10px] text-grey-light truncate max-w-[200px]">
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
          </div>
        </div>
      </div>
      )}

      {/* Bulk Create Modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowBulk(false)}>
          <div className="border border-grey-mid bg-grey-dark p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-sm uppercase tracking-widest text-white">BULK CREATE</h2>
            <p className="font-mono text-[10px] text-grey-light">NUMBERS 1–100 — THE LOWEST FREE ARE USED FIRST</p>
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
          </div>
        </div>
      )}

      {/* Field Mapping Modal */}
      {mappingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setMappingTemplate(null)}>
          <div className="border border-grey-mid bg-grey-dark p-5 w-full max-w-6xl space-y-4 max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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
                  <div key={m.pdfField} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center border border-grey-mid p-2">
                    <div className="md:col-span-4">
                      <div className="font-mono text-xs text-white truncate">{m.pdfField}</div>
                      <div className="font-mono text-[10px] uppercase text-grey-light">{mappingTemplate.fields.find((f) => f.name === m.pdfField)?.type ?? ''}</div>
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
                        <span className="font-mono text-[10px] uppercase text-grey-light">FORMAT: AUTO</span>
                      )}
                    </div>
                  </div>
                ))}

                {mappingError && <p className="font-mono text-xs text-danger">{mappingError}</p>}

                <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
                  <Button size="sm" onClick={saveMapping}>SAVE MAPPING</Button>
                  <Button variant="ghost" size="sm" onClick={() => setMappingTemplate(null)}>CLOSE</Button>
                </div>
              </div>

              {/* Right — live preview of the filled sample card */}
              <div className="border border-grey-mid flex flex-col min-h-[420px] min-w-0">
                <div className="px-3 py-2 border-b border-grey-mid flex items-center justify-between gap-2">
                  <span className="font-mono text-xs uppercase tracking-widest text-white">LIVE PREVIEW</span>
                  <span className="font-mono text-[9px] uppercase text-grey-light">REFRESHES AS YOU MAP</span>
                </div>
                {previewUrl ? (
                  <iframe
                    src={previewUrl}
                    title="GIFT CARD PREVIEW"
                    className="w-full flex-1 bg-white min-h-0"
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center p-4">
                    <p className={`font-mono text-[10px] uppercase ${previewError ? 'text-danger' : 'text-grey-light'}`}>
                      {mappingTemplate.filePath
                        ? (previewError || 'PREPARING PREVIEW...')
                        : 'NO PDF FILE — PREVIEW UNAVAILABLE'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
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
