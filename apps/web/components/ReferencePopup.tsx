'use client'

// A non-guide step reference (tool / item, checklist, task, recipe, section)
// opened in a clean popup. On the admin side ITEM / CHECKLIST / TASK fetch their
// live detail; the worker side shows the already-resolved card (a floor worker
// has no inventory or checklist read permission).

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { STEP_LINK_LABEL, type ResolvedStepLink } from '@/lib/guide-links'
import { thumbUrl } from '@/lib/image-thumb'
import type { GuidePopupVariant } from '@/components/GuidePopup'

interface InventoryDetail {
  id: string
  name: string
  unit: string
  defaultParLevel: number
  costPrice: number | null
  storageNotes: string | null
  category: { name: string } | null
  storageLocations: {
    notes: string | null
    section: { name: string; department: { name: string } | null }
  }[]
}

interface ChecklistDetail {
  id: string
  name: string
  description: string | null
  appearFromTime: string | null
  tasks: { id: string; title: string }[]
}

interface TaskDetail {
  id: string
  title: string
  description: string | null
}

type Detail =
  | { kind: 'ITEM'; item: InventoryDetail }
  | { kind: 'CHECKLIST'; checklist: ChecklistDetail }
  | { kind: 'TASK'; task: TaskDetail }

function detailUrl(link: ResolvedStepLink): string | null {
  if (link.kind === 'ITEM') return `/api/admin/inventory/${link.targetId}`
  if (link.kind === 'CHECKLIST') return `/api/admin/checklists/${link.targetId}`
  if (link.kind === 'TASK') return `/api/admin/tasks/${link.targetId}`
  return null
}

export function ReferencePopup({
  link,
  variant,
  onClose,
}: {
  link: ResolvedStepLink | null
  variant: GuidePopupVariant
  onClose: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)

  useEffect(() => {
    setDetail(null)
    if (!link || variant !== 'admin') return
    const url = detailUrl(link)
    if (!url) return
    const kind = link.kind
    let alive = true
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data) => {
        if (!alive) return
        if (kind === 'ITEM') setDetail({ kind: 'ITEM', item: data as InventoryDetail })
        else if (kind === 'CHECKLIST') setDetail({ kind: 'CHECKLIST', checklist: data as ChecklistDetail })
        else if (kind === 'TASK') setDetail({ kind: 'TASK', task: data as TaskDetail })
      })
      .catch(() => { /* fall back to the resolved card */ })
    return () => { alive = false }
  }, [link, variant])

  if (!link) return null

  const title = (
    <span className="font-mono text-sm font-semibold uppercase tracking-wider">
      <span className="text-grey-light">{STEP_LINK_LABEL[link.kind]} · </span>
      {link.target.label}
    </span>
  )

  const body = (
    <div className="space-y-4">
      {link.target.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl(link.target.imageUrl, 640) ?? link.target.imageUrl} alt="" loading="lazy" decoding="async" className="max-h-56 w-auto border border-grey-mid" />
      )}

      {link.qty && link.qty > 1 && <Badge>{link.qty}×</Badge>}

      {detail?.kind === 'ITEM' && (
        <div className="space-y-1.5 font-mono text-xs">
          {detail.item.category?.name && <p className="uppercase text-grey-light">{detail.item.category.name}</p>}
          <p className="uppercase text-white">UNIT: {detail.item.unit}</p>
          <p className="uppercase text-white">PAR LEVEL: {detail.item.defaultParLevel}</p>
          {detail.item.costPrice != null && <p className="uppercase text-white">COST: ${detail.item.costPrice.toFixed(2)}</p>}
          {detail.item.storageLocations.map((loc, i) => (
            <p key={i} className="uppercase text-grey-light">
              STORED: {[loc.section.department?.name, loc.section.name].filter(Boolean).join(' → ')}
              {loc.notes ? ` · ${loc.notes}` : ''}
            </p>
          ))}
          {detail.item.storageLocations.length === 0 && detail.item.storageNotes && (
            <p className="uppercase text-grey-light">STORED: {detail.item.storageNotes}</p>
          )}
        </div>
      )}

      {detail?.kind === 'CHECKLIST' && (
        <div className="space-y-2">
          {detail.checklist.description && (
            <p className="font-sans text-sm text-grey-light">{detail.checklist.description}</p>
          )}
          {detail.checklist.appearFromTime && (
            <p className="font-mono text-xs uppercase text-warning">FROM {detail.checklist.appearFromTime}</p>
          )}
          <ol className="font-mono text-xs text-white list-decimal list-inside space-y-1">
            {detail.checklist.tasks.map((t) => <li key={t.id}>{t.title}</li>)}
          </ol>
          {detail.checklist.tasks.length === 0 && <p className="font-mono text-xs text-grey-light">NO TASKS.</p>}
        </div>
      )}

      {detail?.kind === 'TASK' && detail.task.description && (
        <p className="font-sans text-sm text-grey-light">{detail.task.description}</p>
      )}

      {!detail && link.target.sub && (
        <p className="font-mono text-xs uppercase text-grey-light">{link.target.sub}</p>
      )}
      {link.note && <p className="font-mono text-xs uppercase text-grey-light">NOTE: {link.note}</p>}
    </div>
  )

  if (variant === 'worker') {
    return (
      <div className="fixed inset-0 z-[70] bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
          <button onClick={onClose} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
            ← BACK
          </button>
          <span className="font-mono text-xs uppercase tracking-widest text-grey-light">REFERENCE</span>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6">{body}</div>
      </div>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={title} size="lg">
      {body}
    </Modal>
  )
}
