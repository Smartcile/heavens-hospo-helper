'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { AddSelect } from '@/components/ui/AddSelect'
import { Combobox, ComboboxHandle } from '@/components/ui/Combobox'
import { MultiImagePicker } from '@/components/ui/MultiImagePicker'
import { VideoPicker } from '@/components/ui/VideoPicker'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { GuideReaderContent, type GuideReaderGuide } from '@/components/GuideReaderContent'
import { ReferenceTableEditor, type ReferenceRowDraft, type ReferenceProductOption } from '@/components/admin/ReferenceTableEditor'
import { getActiveVenueId } from '@/lib/active-venue'
import { moveItem } from '@/lib/array'
import { downloadFile } from '@/lib/download-file'
import { mergeStepImages } from '@/lib/guide-media'
import { guideStepUsageKey } from '@/lib/image-annotations'
import { groupGuidesByFolder } from '@/lib/guide-folders'
import { GUIDE_TYPES, GUIDE_TYPE_LABELS, guideTypeLabel } from '@/lib/guide-types'
import { PRODUCT_REFERENCE_DEFAULT_COLUMNS, mergeMenuRows, sanitiseColumns, type ReferenceColumn, type ReferenceMenuItem } from '@/lib/reference-table'

type LinkKind = 'ITEM' | 'TASK' | 'CHECKLIST' | 'GUIDE' | 'SECTION' | 'RECIPE'
type AudienceKind = 'DEPARTMENT' | 'SECTION' | 'POSITION'

const LINK_KINDS: { value: LinkKind; label: string }[] = [
  { value: 'ITEM', label: 'TOOL / ITEM' },
  { value: 'TASK', label: 'TASK' },
  { value: 'CHECKLIST', label: 'CHECKLIST' },
  { value: 'GUIDE', label: 'GUIDE' },
  { value: 'SECTION', label: 'SECTION' },
  { value: 'RECIPE', label: 'RECIPE' },
]

const AUDIENCE_KINDS: { value: AudienceKind; label: string }[] = [
  { value: 'DEPARTMENT', label: 'DEPARTMENT' },
  { value: 'SECTION', label: 'SECTION' },
  { value: 'POSITION', label: 'POSITION' },
]

interface StepLink {
  kind: LinkKind
  targetId: string
  qty: number | null
  note: string | null
  target?: { label: string; missing: boolean } | null
}

interface Audience {
  kind: AudienceKind
  targetId: string
}

type Option = { value: string; label: string }
type LinkTargets = Record<LinkKind, Option[]>

const EMPTY_TARGETS: LinkTargets = {
  ITEM: [], TASK: [], CHECKLIST: [], GUIDE: [], SECTION: [], RECIPE: [],
}

interface MenuOption { value: string; label: string; itemIds: string[] }

interface Step {
  id: string | null // null = new; sent back on save so step ids stay stable
  heading: string
  content: string
  imageUrls: string[]
  videoUrl: string
  videoPath: string | null
  links: StepLink[]
}

interface TaskGuide {
  id?: string
  taskId: string
  isRequiredForCompetency: boolean
}

interface Guide {
  id: string
  title: string
  description: string | null
  category: string | null
  guideType: string | null
  bodyHtml: string | null
  pdfPath?: string | null
  pdfUrl?: string | null
  venueId: string
  departmentId: string | null
  folderId: string | null
  sourceMenuId?: string | null
  status: 'DRAFT' | 'PUBLISHED'
  isTracked: boolean
  isOnboarding: boolean
  requiresSignOff: boolean
  legacyToolsNote: string | null
  steps: {
    id: string
    heading: string | null
    content: string
    imageUrl: string | null
    imageUrls?: string[] | null
    videoUrl: string | null
    videoPath?: string | null
    links?: StepLink[]
  }[]
  taskGuides?: TaskGuide[]
  audiences?: Audience[]
  tableColumns?: ReferenceColumn[] | null
  tableRows?: {
    id: string
    menuItemId: string | null
    sortOrder: number
    cells: Record<string, unknown>
    menuItem?: ReferenceMenuItem | null
  }[]
  department: { id: string; name: string } | null
  _count?: { tableRows: number }
}

interface Venue { id: string; name: string }
interface Folder { id: string; name: string; venueId: string; sortOrder: number }
interface Department { id: string; name: string; venueId: string }
interface TaskLite { id: string; title: string; venueId: string }
interface Position { id: string; name: string; venueId: string }

function emptyStep(): Step {
  // Client-generated id so the step's photo annotations have a stable usage key
  // before the guide is first saved; the server persists it verbatim.
  return { id: crypto.randomUUID(), heading: '', content: '', imageUrls: [], videoUrl: '', videoPath: null, links: [] }
}

export function GuidesClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string }) {
  const [guides, setGuides] = useState<Guide[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Guide | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [guideType, setGuideType] = useState('HOW_TO')
  const [bodyHtml, setBodyHtml] = useState('')
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfUploading, setPdfUploading] = useState(false)
  const [departmentId, setDepartmentId] = useState('')
  const [folderId, setFolderId] = useState('')
  const [isTracked, setIsTracked] = useState(true)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [requiresSignOff, setRequiresSignOff] = useState(false)
  const [venueId, setVenueId] = useState('')
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([])
  const [competencyTaskIds, setCompetencyTaskIds] = useState<string[]>([])
  const [steps, setSteps] = useState<Step[]>([emptyStep()])
  const [stepDragIdx, setStepDragIdx] = useState<number | null>(null)
  const [tableColumns, setTableColumns] = useState<ReferenceColumn[]>([])
  const [tableRows, setTableRows] = useState<ReferenceRowDraft[]>([])
  const [productOptions, setProductOptions] = useState<ReferenceProductOption[]>([])
  const [menuOptions, setMenuOptions] = useState<MenuOption[]>([])
  const [sourceMenuId, setSourceMenuId] = useState('')
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [linkTargets, setLinkTargets] = useState<LinkTargets>(EMPTY_TARGETS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const linkedRef = useRef<ComboboxHandle>(null)
  const compRef = useRef<ComboboxHandle>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewing, setViewing] = useState<GuideReaderGuide | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [dragGuideId, setDragGuideId] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === filteredGuides.length
        ? new Set()
        : new Set(filteredGuides.map((g) => g.id)),
    )
  }

  // Fetch + blob save — more reliable than window.open for an authed route.
  async function downloadSinglePdf(g: Guide) {
    setPdfError('')
    try {
      await downloadFile(`/api/admin/guides/${g.id}/pdf`, `${g.title}.pdf`)
    } catch {
      setPdfError('PDF DOWNLOAD FAILED')
    }
  }

  async function downloadBulkPdf() {
    if (selectedIds.size === 0) return
    setPdfError('')
    const venueParam = effectiveVenueId ? `&venueId=${encodeURIComponent(effectiveVenueId)}` : ''
    try {
      await downloadFile(`/api/admin/guides/pdf?ids=${[...selectedIds].join(',')}${venueParam}`)
    } catch {
      setPdfError('PDF DOWNLOAD FAILED')
    }
  }

  // OPEN THE WORKER READER — the single-guide GET resolves step links, so the
  // popup renders exactly what a worker sees on their phone.
  async function openView(g: Guide) {
    setPdfError(''); setViewLoading(true)
    try {
      const r = await fetch(`/api/admin/guides/${g.id}`)
      if (!r.ok) { setPdfError('COULD NOT OPEN GUIDE'); return }
      setViewing(await r.json())
    } catch {
      setPdfError('COULD NOT OPEN GUIDE')
    } finally {
      setViewLoading(false)
    }
  }

  async function load() {
    const activeVenueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
    const venueParam = activeVenueId ? `?venueId=${encodeURIComponent(activeVenueId)}` : ''
    const [gR, fR, dR, tR] = await Promise.all([
      fetch(`/api/admin/guides${venueParam}`),
      fetch(`/api/admin/guide-folders${venueParam}`),
      fetch('/api/admin/departments'),
      fetch('/api/admin/tasks'),
    ])
    const [gData, fData, dData, tData] = await Promise.all([gR.json(), fR.json(), dR.json(), tR.json()])
    setGuides(Array.isArray(gData) ? gData : [])
    setFolders(Array.isArray(fData) ? fData : [])
    setDepartments(dData)
    setTasks(tData)
    setLoading(false)
  }

  function toggleFolder(id: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function addFolder() {
    const name = prompt('FOLDER NAME')
    if (!name?.trim()) return
    await fetch('/api/admin/guide-folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, venueId: role === 'ADMIN' ? effectiveVenueId : undefined }),
    })
    load()
  }

  async function renameFolder(f: Folder) {
    const name = prompt('FOLDER NAME', f.name)
    if (!name?.trim() || name === f.name) return
    await fetch(`/api/admin/guide-folders/${f.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    load()
  }

  async function deleteFolder(f: Folder) {
    if (!confirm(`DELETE FOLDER "${f.name}"? ITS GUIDES MOVE TO UNFILED.`)) return
    await fetch(`/api/admin/guide-folders/${f.id}`, { method: 'DELETE' })
    load()
  }

  // Drag a guide card onto a folder to file it. The card moves optimistically so
  // the drop feels instant; a failed save rolls the whole list back.
  async function moveGuideToFolder(guideId: string, targetFolderId: string | null) {
    const guide = guides.find((g) => g.id === guideId)
    if (!guide || (guide.folderId ?? null) === targetFolderId) {
      setDragGuideId(null); setDragOverFolder(null)
      return
    }
    const previous = guides
    const key = targetFolderId ?? '__unfiled__'
    setGuides((gs) => gs.map((g) => (g.id === guideId ? { ...g, folderId: targetFolderId } : g)))
    setCollapsedFolders((prev) => { const next = new Set(prev); next.delete(key); return next })
    setDragGuideId(null); setDragOverFolder(null)
    try {
      const r = await fetch(`/api/admin/guides/${guideId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: targetFolderId }),
      })
      if (!r.ok) throw new Error('move failed')
    } catch {
      setGuides(previous)
    }
  }

  useEffect(() => { load() }, [])

  // Everything a step or audience can point at, for one venue. A named function
  // (not just an effect) so a save can refresh it — a guide created in this
  // session must appear in another guide's `+ LINK → GUIDE` picker immediately,
  // without a full page reload.
  const loadLinkTargets = useCallback((vid: string) => {
    if (!vid) return
    fetch(`/api/admin/guides/link-targets?venueId=${encodeURIComponent(vid)}`)
      .then((r) => (r.ok ? r.json() : null))
      // Merge over the empty shape so every kind key exists — a partial payload
      // must not leave a picker's option list undefined.
      .then((d: (Partial<LinkTargets> & { MENU_ITEM?: ReferenceProductOption[]; MENU?: MenuOption[] }) | null) => {
        if (d && !Array.isArray(d)) {
          setLinkTargets({ ...EMPTY_TARGETS, ...d })
          setProductOptions(Array.isArray(d.MENU_ITEM) ? d.MENU_ITEM : [])
          setMenuOptions(Array.isArray(d.MENU) ? d.MENU : [])
        }
      })
      .catch(() => { /* picker just stays empty */ })
  }, [])

  useEffect(() => {
    loadLinkTargets(role === 'ADMIN' ? venueId : sessionVenueId)
  }, [role, venueId, sessionVenueId, loadLinkTargets])

  useEffect(() => {
    const vid = role === 'ADMIN' ? venueId : sessionVenueId
    if (!vid) return
    fetch(`/api/admin/positions?venueId=${encodeURIComponent(vid)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((p: Position[]) => setPositions(p))
      .catch(() => { /* positions are optional */ })
  }, [role, venueId, sessionVenueId])

  useEffect(() => {
    if (role === 'ADMIN') {
      fetch('/api/admin/venues')
        .then((r) => r.json())
        .then((v: Venue[]) => {
          setVenues(v)
          if (!venueId && v.length > 0) {
            const active = getActiveVenueId(role, sessionVenueId, defaultVenueId)
            setVenueId(active || v[0].id)
          }
        })
    }
  }, [role])

  function openCreate() {
    setEditing(null)
    setTitle(''); setDescription(''); setCategory('')
    setGuideType('HOW_TO'); setBodyHtml('')
    setPdfPath(null); setPdfUrl('')
    setDepartmentId(''); setFolderId(''); setIsTracked(true); setIsOnboarding(false); setRequiresSignOff(false)
    setLinkedTaskIds([]); setCompetencyTaskIds([])
    setSteps([emptyStep()]); setTableColumns([]); setTableRows([]); setSourceMenuId(''); setAudiences([])
    setVenueId(getActiveVenueId(role, sessionVenueId, defaultVenueId))
    setError(''); setOpen(true)
  }

  function openEdit(g: Guide) {
    setEditing(g)
    setTitle(g.title); setDescription(g.description ?? ''); setCategory(g.category ?? '')
    setGuideType(g.guideType ?? ''); setBodyHtml(g.bodyHtml ?? '')
    setPdfPath(g.pdfPath ?? null); setPdfUrl(g.pdfUrl ?? '')
    setDepartmentId(g.departmentId ?? ''); setFolderId(g.folderId ?? ''); setSourceMenuId(g.sourceMenuId ?? '')
    setIsTracked(g.isTracked); setIsOnboarding(g.isOnboarding); setRequiresSignOff(g.requiresSignOff)
    setVenueId(g.venueId)

    const tgs = g.taskGuides ?? []
    setLinkedTaskIds(tgs.filter((t) => !t.isRequiredForCompetency).map((t) => t.taskId))
    setCompetencyTaskIds(tgs.filter((t) => t.isRequiredForCompetency).map((t) => t.taskId))

    setSteps(
      g.steps.length
        ? g.steps.map((s) => ({
            id: s.id,
            heading: s.heading ?? '',
            content: s.content,
            imageUrls: mergeStepImages(s.imageUrls, s.imageUrl),
            videoUrl: s.videoUrl ?? '',
            videoPath: s.videoPath ?? null,
            links: s.links ?? [],
          }))
        : [emptyStep()]
    )
    setTableColumns(sanitiseColumns(g.tableColumns))
    setTableRows(
      (g.tableRows ?? []).map((r) => ({
        id: r.id,
        menuItemId: r.menuItemId,
        cells: Object.fromEntries(
          Object.entries(r.cells ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)]),
        ),
      })),
    )
    setAudiences(g.audiences ?? [])
    setError(''); setOpen(true)
  }

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  async function uploadPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!editing) { setError('SAVE THE GUIDE FIRST, THEN ATTACH A PDF'); return }
    setPdfUploading(true); setError('')
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch(`/api/admin/guides/${editing.id}/attachment`, { method: 'POST', body: fd })
    if (r.ok) {
      const d = await r.json()
      setPdfPath(d.url)
    } else {
      setError('PDF UPLOAD FAILED')
    }
    setPdfUploading(false)
  }

  async function handleSave() {
    if (!title.trim()) { setError('TITLE IS REQUIRED'); return }

    setSaving(true); setError('')
    const cleanSteps = steps.filter((s) => s.content.trim() || s.heading.trim())

    const finalLinked = linkedRef.current?.getFinalSelection() ?? linkedTaskIds
    const finalComp = compRef.current?.getFinalSelection() ?? competencyTaskIds

    const taskGuides: { taskId: string; isRequiredForCompetency: boolean }[] = [
      ...finalLinked.filter((id) => !finalComp.includes(id)).map((taskId) => ({ taskId, isRequiredForCompetency: false })),
      ...finalComp.map((taskId) => ({ taskId, isRequiredForCompetency: true })),
    ]

    const payload = {
      title, description, category,
      guideType: guideType || null,
      bodyHtml: bodyHtml || null,
      pdfPath: pdfPath || null,
      pdfUrl: pdfUrl || null,
      venueId: role === 'ADMIN' ? venueId : undefined,
      departmentId: departmentId || null,
      folderId: folderId || null,
      isTracked, isOnboarding, requiresSignOff,
      steps: cleanSteps.map((s) => ({
        id: s.id,
        heading: s.heading || null,
        content: s.content,
        imageUrls: s.imageUrls,
        videoUrl: s.videoUrl || null,
        videoPath: s.videoPath,
        links: s.links.map((l) => ({
          kind: l.kind, targetId: l.targetId, qty: l.qty, note: l.note,
        })),
      })),
      taskGuides,
      audiences,
      ...(guideType === 'PRODUCT_REFERENCE'
        ? {
            tableColumns,
            sourceMenuId: sourceMenuId || null,
            rows: tableRows.map((r) => ({ id: r.id, menuItemId: r.menuItemId, cells: r.cells })),
          }
        : {}),
    }
    const url = editing ? `/api/admin/guides/${editing.id}` : '/api/admin/guides'
    const method = editing ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setOpen(false); load()
    // A guide created or renamed just now must appear in other guides' `+ LINK →
    // GUIDE` picker immediately — the initial fetch predates it.
    loadLinkTargets(role === 'ADMIN' ? venueId : sessionVenueId)
  }

  async function handleDelete(g: Guide) {
    if (!confirm(`DELETE GUIDE "${g.title}"?`)) return
    await fetch(`/api/admin/guides/${g.id}`, { method: 'DELETE' })
    load()
  }

  async function handlePublish(g: Guide, newStatus: 'DRAFT' | 'PUBLISHED') {
    await fetch(`/api/admin/guides/${g.id}/publish`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }),
    })
    load()
  }

  // The reference table image is shared with the product — save it there and
  // update the local option list so the table redraws immediately.
  async function setProductImage(menuItemId: string, imageUrl: string | null) {
    setProductOptions((prev) => prev.map((p) => (p.value === menuItemId ? { ...p, imageUrl } : p)))
    await fetch('/api/admin/guides/product-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuItemId, imageUrl }),
    })
  }

  // Pull a menu's products in as rows (additive — existing rows + cells stay).
  function syncFromMenu() {
    const menu = menuOptions.find((m) => m.value === sourceMenuId)
    if (!menu) return
    setTableRows((prev) => mergeMenuRows(prev, menu.itemIds))
  }

  const effectiveVenueId = role === 'ADMIN' ? venueId : sessionVenueId
  const filteredDepartments = departments.filter((d) => !effectiveVenueId || d.venueId === effectiveVenueId)
  const filteredTasks = tasks.filter((t) => !effectiveVenueId || t.venueId === effectiveVenueId)
  const filteredGuides = guides.filter((g) => !effectiveVenueId || g.venueId === effectiveVenueId)

  const filteredPositions = positions.filter((p) => !effectiveVenueId || p.venueId === effectiveVenueId)

  // Audience targets per kind. Sections come from the link-targets payload so
  // there is no second fetch for the same list.
  const audienceOptions: Record<AudienceKind, Option[]> = {
    DEPARTMENT: filteredDepartments.map((d) => ({ value: d.id, label: d.name })),
    SECTION: linkTargets.SECTION,
    POSITION: filteredPositions.map((p) => ({ value: p.id, label: p.name })),
  }

  // Reverse lookup — option value → the kind it belongs to — so the grouped
  // add-pickers can add the right audience / link type from the chosen item.
  const audienceKindByTarget = new Map<string, AudienceKind>()
  for (const k of AUDIENCE_KINDS) {
    for (const o of audienceOptions[k.value]) audienceKindByTarget.set(o.value, k.value)
  }
  const linkKindByTarget = new Map<string, LinkKind>()
  for (const k of LINK_KINDS) {
    for (const o of linkTargets[k.value] ?? []) linkKindByTarget.set(o.value, k.value)
  }

  const audienceLabel = (a: Audience) =>
    audienceOptions[a.kind].find((o) => o.value === a.targetId)?.label ?? 'REMOVED'

  function addAudience(kind: AudienceKind, targetId: string) {
    if (!targetId) return
    setAudiences((prev) =>
      prev.some((a) => a.kind === kind && a.targetId === targetId)
        ? prev
        : [...prev, { kind, targetId }]
    )
  }

  function updateStepLinks(stepIndex: number, next: StepLink[]) {
    setSteps((prev) => prev.map((s, i) => (i === stepIndex ? { ...s, links: next } : s)))
  }

  const deptOptions = [
    { value: '', label: 'ALL STAFF (NOT DEPT-SPECIFIC)' },
    ...filteredDepartments.map((d) => ({ value: d.id, label: d.name })),
  ]
  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))
  const taskOptions = filteredTasks.map((t) => ({ value: t.id, label: t.title }))
  const filteredFolders = folders.filter((f) => !effectiveVenueId || f.venueId === effectiveVenueId)
  const folderGroups = groupGuidesByFolder(filteredGuides, filteredFolders)
  const showFolders = filteredFolders.length > 0
  const folderSelectOptions = [
    { value: '', label: 'UNFILED' },
    ...filteredFolders.map((f) => ({ value: f.id, label: f.name })),
  ]
  const menuSelectOptions = [
    { value: '', label: '— NONE (MANUAL ROWS) —' },
    ...menuOptions.map((m) => ({ value: m.value, label: m.label })),
  ]

  function renderGuideCard(g: Guide) {
    const isTable = g.guideType === 'PRODUCT_REFERENCE'
    return (
      <div
        key={g.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/guide-id', g.id)
          e.dataTransfer.effectAllowed = 'move'
          setDragGuideId(g.id)
        }}
        onDragEnd={() => { setDragGuideId(null); setDragOverFolder(null) }}
        className={`bg-grey-dark border p-4 flex flex-col gap-2 transition-opacity ${g.status === 'DRAFT' ? 'border-yellow-700' : 'border-grey-mid'} ${dragGuideId === g.id ? 'opacity-50' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <input
              type="checkbox"
              checked={selectedIds.has(g.id)}
              onChange={() => toggleSelected(g.id)}
              className="w-4 h-4 accent-white mt-0.5 shrink-0"
              aria-label={`SELECT ${g.title}`}
            />
            <span className="font-mono font-semibold text-sm uppercase text-white">{g.title}</span>
          </div>
          <Badge variant={g.status === 'DRAFT' ? 'warning' : 'success'}>{g.status}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {g.isTracked && <Badge variant="default">TRACKED</Badge>}
          {!g.isTracked && <Badge variant="default">REFERENCE</Badge>}
          {g.isOnboarding && <Badge variant="warning">ONBOARDING</Badge>}
          {guideTypeLabel(g.guideType) && <Badge variant="default">{guideTypeLabel(g.guideType)}</Badge>}
          {g.department && <Badge>{g.department.name}</Badge>}
          {g.category && <Badge>{g.category}</Badge>}
          <Badge variant={g.requiresSignOff ? 'warning' : 'success'}>
            {g.requiresSignOff ? 'SIGN-OFF' : 'SELF'}
          </Badge>
        </div>
        {g.description && <p className="font-sans text-xs text-grey-light line-clamp-2">{g.description}</p>}
        <div className="font-mono text-xs text-grey-light">
          {isTable
            ? `${g._count?.tableRows ?? 0} ITEM${(g._count?.tableRows ?? 0) !== 1 ? 'S' : ''}`
            : `${g.steps.length} STEP${g.steps.length !== 1 ? 'S' : ''}`}
          {(g.taskGuides?.length ?? 0) > 0 && <> · {g.taskGuides!.length} TASK LINK{g.taskGuides!.length !== 1 ? 'S' : ''}</>}
        </div>
        {g.legacyToolsNote && (
          <p className="font-mono text-xs text-grey-light leading-tight">{g.legacyToolsNote}</p>
        )}
        <div className="flex gap-3 pt-1 border-t border-grey-mid mt-1">
          <button onClick={() => openEdit(g)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">EDIT</button>
          <button onClick={() => openView(g)} disabled={viewLoading} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors disabled:opacity-40">VIEW</button>
          <button onClick={() => downloadSinglePdf(g)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">⬇ PDF</button>
          <button onClick={() => handleDelete(g)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DELETE</button>
          {g.status === 'DRAFT'
            ? <button onClick={() => handlePublish(g, 'PUBLISHED')} className="font-mono text-xs uppercase text-success hover:text-white transition-colors ml-auto">PUBLISH</button>
            : <button onClick={() => handlePublish(g, 'DRAFT')} className="font-mono text-xs uppercase text-yellow-500 hover:text-white transition-colors ml-auto">UNPUBLISH</button>
          }
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">PLAYBOOK GUIDES</h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">
            TRAINING, SOPS, FAQS, HOW-TOS + PRODUCT REFERENCES. PUBLISH WHEN READY.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filteredGuides.length > 0 && (
            <Button size="sm" variant="ghost" onClick={toggleSelectAll}>
              {selectedIds.size === filteredGuides.length ? 'CLEAR ALL' : 'SELECT ALL'}
            </Button>
          )}
          {selectedIds.size > 0 && (
            <Button size="sm" variant="ghost" onClick={downloadBulkPdf}>
              ⬇ PDF ({selectedIds.size})
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={addFolder}>+ NEW FOLDER</Button>
          <Button size="sm" onClick={openCreate}>+ NEW GUIDE</Button>
        </div>
      </div>

      {pdfError && <p className="font-mono text-xs text-danger">{pdfError}</p>}
      {showFolders && !loading && (
        <p className="font-mono text-xs text-grey-light">TIP: DRAG A GUIDE CARD ONTO A FOLDER TO FILE IT.</p>
      )}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : filteredGuides.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO GUIDES YET.</p>
      ) : !showFolders ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredGuides.map(renderGuideCard)}
        </div>
      ) : (
        <div className="space-y-5">
          {folderGroups.map(({ folder, guides: groupGuides }) => {
            const key = folder?.id ?? '__unfiled__'
            const collapsed = collapsedFolders.has(key)
            return (
              <div
                key={key}
                data-folder-key={key}
                onDragOver={(e) => {
                  if (!dragGuideId) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverFolder(key)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/guide-id')
                  if (id) moveGuideToFolder(id, folder?.id ?? null)
                }}
                className={`space-y-3 transition-colors ${dragOverFolder === key && dragGuideId ? 'ring-1 ring-white/40 bg-white/5' : ''}`}
              >
                <div className="flex items-center gap-2 border-b border-grey-mid pb-1">
                  <button
                    type="button"
                    onClick={() => toggleFolder(key)}
                    className="font-mono text-xs uppercase tracking-wider text-grey-light hover:text-white transition-colors"
                  >
                    {collapsed ? '▸' : '▾'} {folder ? folder.name : 'UNFILED'}
                  </button>
                  <span className="font-mono text-xs text-grey-light">({groupGuides.length})</span>
                  {folder && (
                    <span className="ml-auto flex gap-3">
                      <button type="button" onClick={() => renameFolder(folder)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">RENAME</button>
                      <button type="button" onClick={() => deleteFolder(folder)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DEL</button>
                    </span>
                  )}
                </div>
                {!collapsed && groupGuides.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {groupGuides.map(renderGuideCard)}
                  </div>
                )}
                {!collapsed && groupGuides.length === 0 && (
                  <p className="font-mono text-xs text-grey-light">EMPTY — DRAG A GUIDE HERE, OR USE ITS EDIT FORM.</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'EDIT GUIDE' : 'NEW GUIDE'} size="xl">
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="HOW TO CLEAN THE COFFEE MACHINE" />
          <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          {role === 'ADMIN' && !editing && (
            <Select label="Venue" value={venueId} onChange={(e) => setVenueId(e.target.value)} options={venueOptions} />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select
              label="Type"
              value={guideType}
              onChange={(e) => {
                const t = e.target.value
                setGuideType(t)
                // A product reference needs a table — seed the default columns.
                if (t === 'PRODUCT_REFERENCE' && tableColumns.length === 0) {
                  setTableColumns(PRODUCT_REFERENCE_DEFAULT_COLUMNS)
                }
              }}
              options={[{ value: '', label: '— NONE —' }, ...GUIDE_TYPES.map((t) => ({ value: t, label: GUIDE_TYPE_LABELS[t] }))]}
            />
            <Select label="Folder" value={folderId} onChange={(e) => setFolderId(e.target.value)} options={folderSelectOptions} />
            <Select label="Auto-assign to department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={deptOptions} />
            <Input label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="BAR" />
          </div>

          <div className="border border-grey-mid p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Applies to</label>
              <span className="font-mono text-xs uppercase text-grey-light">
                TAG A SECTION OR ROLE — STAFF INHERIT IT AUTOMATICALLY
              </span>
            </div>
            {audiences.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {audiences.map((a) => (
                  <span
                    key={`${a.kind}:${a.targetId}`}
                    className="inline-flex items-center gap-1.5 border border-grey-mid px-2 py-0.5 font-mono text-xs uppercase text-white"
                  >
                    <span className="text-grey-light">{a.kind}</span>
                    {audienceLabel(a)}
                    <button
                      type="button"
                      onClick={() => setAudiences((prev) => prev.filter((x) => !(x.kind === a.kind && x.targetId === a.targetId)))}
                      className="text-grey-light hover:text-danger transition-colors"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <AddSelect
              groups={AUDIENCE_KINDS.map((k) => ({ label: k.label, options: audienceOptions[k.value] }))}
              selected={audiences.map((a) => a.targetId)}
              onAdd={(targetId) => {
                const kind = audienceKindByTarget.get(targetId)
                if (kind) addAudience(kind, targetId)
              }}
              placeholder="+ ADD DEPARTMENT / SECTION / ROLE"
              emptyLabel="ALL ADDED"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Combobox
              ref={linkedRef}
              label="Linked tasks (how-to guide for)"
              options={taskOptions}
              selected={linkedTaskIds}
              onChange={setLinkedTaskIds}
              onPreview={(id) => window.open(`/admin/tasks?task=${id}`, '_blank')}
              placeholder="Search tasks..."
            />
            <Combobox
              ref={compRef}
              label="Required competency (must complete before task)"
              options={taskOptions}
              selected={competencyTaskIds}
              onChange={setCompetencyTaskIds}
              onPreview={(id) => window.open(`/admin/tasks?task=${id}`, '_blank')}
              placeholder="Search tasks..."
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isTracked} onChange={(e) => setIsTracked(e.target.checked)} className="w-4 h-4 accent-white" />
              <span className="font-mono text-xs uppercase text-white">TRACK COMPLETION</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={requiresSignOff} onChange={(e) => setRequiresSignOff(e.target.checked)} className="w-4 h-4 accent-white" disabled={!isTracked} />
              <span className={`font-mono text-xs uppercase ${!isTracked ? 'text-grey-light' : 'text-white'}`}>REQUIRES MANAGER SIGN-OFF</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isOnboarding} onChange={(e) => setIsOnboarding(e.target.checked)} className="w-4 h-4 accent-white" disabled={!isTracked} />
              <span className={`font-mono text-xs uppercase ${!isTracked ? 'text-grey-light' : 'text-white'}`}>PART OF ONBOARDING</span>
            </label>
          </div>

          {!isTracked && (
            <p className="font-mono text-xs text-grey-light">REFERENCE GUIDES ARE NOT TRACKED. SIGN-OFF AND ONBOARDING DO NOT APPLY.</p>
          )}

          <div className="border border-grey-mid p-3 space-y-1">
            <div className="font-mono text-xs uppercase tracking-wider text-grey-light">On the worker phone</div>
            <div className="font-mono text-xs text-white">
              {editing?.status === 'DRAFT'
                ? 'DRAFT — WORKERS CANNOT SEE THIS GUIDE YET. PUBLISH FROM THE LIST TO MAKE IT LIVE.'
                : isTracked
                  ? 'VISIBLE TO WORKERS — TRACKED (MY GUIDES + TREE, COMPLETIONS COUNT).'
                  : 'VISIBLE TO WORKERS — REFERENCE ONLY (SHOWS IN THE BIBLE AS READ-ONLY, NOTHING IS TRACKED).'}
            </div>
            <p className="font-mono text-xs uppercase text-grey-light leading-tight">
              A WORKER SEES A PUBLISHED GUIDE WHEN IT APPLIES TO THEM: ONBOARDING · DEPARTMENT · SECTION/POSITION TAG · OR A DIRECT ASSIGNMENT.
            </p>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Instructions (rich text)</label>
            <p className="font-mono text-xs uppercase text-grey-light leading-tight">
              WRITE A SIMPLE DOCUMENT — HEADINGS, PARAGRAPHS, LISTS — AND ADD STEPS BELOW ONLY IF YOU WANT A CHECKLIST. EITHER CAN STAND ALONE.
            </p>
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Write basic instructions here…" />
          </div>

          <div className="border border-grey-mid p-3 space-y-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Guide PDF (whole document)</label>
            <p className="font-mono text-xs uppercase text-grey-light leading-tight">
              UPLOAD A PDF TO ATTACH IT TO THIS GUIDE — IT IS APPENDED TO THE GUIDE PDF DOWNLOAD. OR PASTE A LINK TO A PDF HOSTED ELSEWHERE.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <label className={`font-mono text-xs uppercase border px-3 py-1.5 transition-colors ${editing ? 'border-grey-mid text-grey-light hover:border-white hover:text-white cursor-pointer' : 'border-grey-mid text-grey-light opacity-40'}`}>
                {pdfUploading ? 'UPLOADING…' : '⬆ UPLOAD PDF'}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={!editing || pdfUploading}
                  onChange={uploadPdf}
                  className="hidden"
                />
              </label>
              {!editing && <span className="font-mono text-xs uppercase text-grey-light">SAVE THE GUIDE FIRST TO ATTACH A PDF</span>}
              {pdfPath && (
                <>
                  <a href={pdfPath} target="_blank" rel="noopener noreferrer" className="font-mono text-xs uppercase text-info hover:text-white transition-colors">
                    OPEN UPLOADED PDF ↗
                  </a>
                  <button type="button" onClick={() => setPdfPath(null)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">
                    REMOVE
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value.trim())}
                placeholder="https://example.com/document.pdf"
                className="flex-1 bg-black border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none focus:border-white placeholder:text-grey-light"
              />
              {pdfUrl && (
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs uppercase text-info hover:text-white transition-colors shrink-0">
                  OPEN ↗
                </a>
              )}
            </div>
          </div>

          {guideType === 'PRODUCT_REFERENCE' && (
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Reference table</label>
              <p className="font-mono text-xs uppercase text-grey-light leading-tight">
                ONE ROW PER ITEM. COLUMNS FROM THE LINKED PRODUCT FILL THEMSELVES; THE IMAGE IS SHARED WITH THE PRODUCT.
              </p>
              <div className="border border-grey-mid p-3 space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[12rem]">
                    <Select label="Source menu" value={sourceMenuId} onChange={(e) => setSourceMenuId(e.target.value)} options={menuSelectOptions} />
                  </div>
                  <Button size="sm" variant="ghost" onClick={syncFromMenu} disabled={!sourceMenuId}>↻ SYNC FROM MENU</Button>
                </div>
                <p className="font-mono text-xs uppercase text-grey-light leading-tight">
                  OPTIONAL — PICK A MENU, THEN SYNC TO PULL ITS PRODUCTS IN AS ROWS. SYNC IS ADDITIVE: YOUR ROWS AND TYPED CELLS STAY.
                </p>
              </div>
              <ReferenceTableEditor
                columns={tableColumns}
                rows={tableRows}
                products={productOptions}
                onColumnsChange={setTableColumns}
                onRowsChange={setTableRows}
                onProductImageChange={setProductImage}
              />
            </div>
          )}

          {guideType !== 'PRODUCT_REFERENCE' && (
          <div className="space-y-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Steps (optional)</label>
            {steps.map((s, i) => (
              <div
                key={i}
                className="border border-grey-mid p-3 space-y-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (stepDragIdx === null || stepDragIdx === i) return
                  setSteps((p) => moveItem(p, stepDragIdx, i))
                  setStepDragIdx(null)
                }}
              >
                <div
                  draggable
                  onDragStart={(e) => { setStepDragIdx(i); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => setStepDragIdx(null)}
                  className="flex items-center justify-between cursor-grab active:cursor-grabbing"
                >
                  <span className="font-mono text-xs text-grey-light flex items-center gap-1.5">
                    <span aria-hidden className="text-grey-mid">⠿</span> STEP {i + 1}
                  </span>
                  <div className="flex items-center gap-3">
                    <button type="button" disabled={i === 0} onClick={() => setSteps((p) => moveItem(p, i, i - 1))} className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30" title="Move up">↑</button>
                    <button type="button" disabled={i === steps.length - 1} onClick={() => setSteps((p) => moveItem(p, i, i + 1))} className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30" title="Move down">↓</button>
                    {steps.length > 1 && (
                      <button type="button" onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">DEL</button>
                    )}
                  </div>
                </div>
                <Input value={s.heading} onChange={(e) => updateStep(i, { heading: e.target.value })} placeholder="STEP HEADING (OPTIONAL)" />
                <Textarea value={s.content} onChange={(e) => updateStep(i, { content: e.target.value })} placeholder="What to do in this step..." />
                <MultiImagePicker
                  label="Photos"
                  value={s.imageUrls}
                  onChange={(urls) => updateStep(i, { imageUrls: urls })}
                  usageKey={s.id ? guideStepUsageKey(s.id) : undefined}
                />
                <VideoPicker label="Video" value={s.videoPath} onChange={(url) => updateStep(i, { videoPath: url })} />
                <Input value={s.videoUrl} onChange={(e) => updateStep(i, { videoUrl: e.target.value })} placeholder="VIDEO LINK (YOUTUBE/VIMEO, OPTIONAL)" />

                <div className="border-t border-grey-mid pt-2 space-y-2">
                  <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
                    Links — tools, tasks, lists, guides
                  </label>
                  {s.links.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {s.links.map((l) => (
                        <span
                          key={`${l.kind}:${l.targetId}`}
                          className="inline-flex items-center gap-1.5 border border-grey-mid px-2 py-0.5 font-mono text-xs uppercase text-white"
                        >
                          <span className="text-grey-light">{l.kind}</span>
                          {linkTargets[l.kind]?.find((o) => o.value === l.targetId)?.label
                            ?? l.target?.label
                            ?? 'REMOVED'}
                          <button
                            type="button"
                            onClick={() => updateStepLinks(i, s.links.filter((x) => !(x.kind === l.kind && x.targetId === l.targetId)))}
                            className="text-grey-light hover:text-danger transition-colors"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <AddSelect
                    groups={LINK_KINDS.map((k) => ({ label: k.label, options: linkTargets[k.value] ?? [] }))}
                    selected={s.links.map((l) => l.targetId)}
                    onAdd={(targetId) => {
                      const kind = linkKindByTarget.get(targetId)
                      if (!kind) return
                      if (s.links.some((x) => x.kind === kind && x.targetId === targetId)) return
                      updateStepLinks(i, [...s.links, { kind, targetId, qty: null, note: null }])
                    }}
                    placeholder="+ LINK A TOOL / TASK / LIST / GUIDE"
                    emptyLabel="ALL LINKED"
                  />
                </div>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSteps((p) => [...p, emptyStep()])}>+ ADD STEP</Button>
          </div>
          )}

          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} loading={saving}>SAVE GUIDE</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      {/* Worker-view preview — the same reader a worker sees on the phone. */}
      <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing?.title} size="lg">
        {viewing && (
          <div className="space-y-6">
            <GuideReaderContent guide={viewing} />
          </div>
        )}
      </Modal>
    </div>
  )
}
