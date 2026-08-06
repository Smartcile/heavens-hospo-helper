'use client'

// Renders a step's links. Shared by the admin editor preview and the worker
// reader so a tool card looks identical wherever it appears.

import { STEP_LINK_LABEL, type ResolvedStepLink } from '@/lib/guide-links'

const KIND_COLOUR: Record<string, string> = {
  ITEM: '#60A5FA',
  TASK: '#E8E8E8',
  CHECKLIST: '#4ADE80',
  GUIDE: '#F97316',
  SECTION: '#C084FC',
  RECIPE: '#FACC15',
}

export function GuideStepLinks({ links }: { links: ResolvedStepLink[] }) {
  if (!links || links.length === 0) return null

  return (
    <div className="space-y-1.5">
      {links.map((l) => {
        const accent = KIND_COLOUR[l.kind] ?? '#6B6B6B'
        return (
          <div
            key={l.id}
            className={`flex items-center gap-2.5 border bg-grey-dark px-2.5 py-2 ${
              l.target.missing ? 'border-danger/40' : 'border-grey-mid'
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
                className="font-mono text-[9px] uppercase tracking-widest"
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
                <div className="font-mono text-[10px] uppercase text-grey-light truncate">
                  {l.note || l.target.sub}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
