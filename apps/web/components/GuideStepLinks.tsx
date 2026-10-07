'use client'

// Renders a step's links. Shared by the admin editor preview and the worker
// reader so a tool card looks identical wherever it appears. A link is tappable:
// a GUIDE asks to open in a popup (then shows the reader), and a tool / list /
// task opens a compact reference popup.

import { useState } from 'react'
import { STEP_LINK_LABEL, type ResolvedStepLink } from '@/lib/guide-links'
import { useGuidePopup, type GuidePopupVariant } from '@/components/GuidePopup'
import { ReferencePopup } from '@/components/ReferencePopup'

const KIND_COLOUR: Record<string, string> = {
  ITEM: '#60A5FA',
  TASK: '#E8E8E8',
  CHECKLIST: '#4ADE80',
  GUIDE: '#F97316',
  SECTION: '#C084FC',
  RECIPE: '#FACC15',
}

export function GuideStepLinks({ links, variant = 'admin' }: { links: ResolvedStepLink[]; variant?: GuidePopupVariant }) {
  const { requestGuide, nodes } = useGuidePopup(variant)
  const [refLink, setRefLink] = useState<ResolvedStepLink | null>(null)

  if (!links || links.length === 0) return null

  function open(l: ResolvedStepLink) {
    if (l.target.missing) return
    if (l.kind === 'GUIDE') requestGuide(l.targetId, l.target.label)
    else setRefLink(l)
  }

  return (
    <>
      <div className="space-y-1.5">
        {links.map((l) => {
          const accent = KIND_COLOUR[l.kind] ?? '#6B6B6B'
          const clickable = !l.target.missing
          return (
            <button
              key={l.id}
              type="button"
              disabled={!clickable}
              onClick={() => open(l)}
              className={`w-full text-left flex items-center gap-2.5 border bg-grey-dark px-2.5 py-2 transition-colors ${
                l.target.missing ? 'border-danger/40 cursor-default' : 'border-grey-mid hover:border-white cursor-pointer'
              }`}
              style={l.target.missing ? undefined : { borderLeftColor: accent, borderLeftWidth: 3 }}
            >
              {l.target.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={l.target.imageUrl}
                  alt=""
                  className="h-10 w-10 flex-shrink-0 object-cover border border-grey-mid"
                />
              )}
              <div className="min-w-0 flex-1">
                <div
                  className="font-mono text-xs uppercase tracking-widest"
                  style={{ color: l.target.missing ? '#F87171' : accent }}
                >
                  {STEP_LINK_LABEL[l.kind]}
                </div>
                <div
                  className={`font-mono text-xs leading-tight truncate ${
                    l.target.missing ? 'text-danger' : 'text-white'
                  }`}
                >
                  {l.qty && l.qty > 1 && <span className="text-grey-light">{l.qty}× </span>}
                  {l.target.label}
                </div>
                {(l.note || l.target.sub) && (
                  <div className="font-mono text-xs uppercase text-grey-light truncate">
                    {l.note || l.target.sub}
                  </div>
                )}
              </div>
              {clickable && <span className="font-mono text-xs text-grey-light flex-shrink-0">OPEN ›</span>}
            </button>
          )
        })}
      </div>
      {nodes}
      <ReferencePopup link={refLink} variant={variant} onClose={() => setRefLink(null)} />
    </>
  )
}
