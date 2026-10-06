'use client'

// A plain-text rendering of a menu — groups, items and their size/price columns,
// styled like the venue's printed menu. Used as the live right-hand preview in
// the menu builder. Pure presentation: it only reads `groups` + `lines`.

import { groupMenuLines, formatSizePrice, type MenuLineLike } from '@/lib/menu-lines'

export interface MenuPreviewLine extends MenuLineLike {
  unit?: string | null
}

export function MenuPreview({
  menuName,
  venueName,
  groups,
  lines,
}: {
  menuName: string
  venueName?: string | null
  groups: { id: string; name: string; sortOrder: number }[]
  lines: MenuPreviewLine[]
}) {
  const grouped = groupMenuLines(groups, lines)
  const hasRealGroup = grouped.some((g) => g.id !== null)

  return (
    <div className="border border-grey-mid bg-grey-dark/40 p-4 font-mono text-white">
      <div className="text-center border-b border-grey-mid pb-3 mb-3">
        {venueName && <div className="text-2xs uppercase tracking-widest text-grey-light">{venueName}</div>}
        <div className="text-base font-bold uppercase tracking-widest">{menuName || 'UNTITLED MENU'}</div>
      </div>

      {grouped.length === 0 ? (
        <p className="text-xs text-grey-light text-center py-6">ADD ITEMS TO SEE THE MENU</p>
      ) : (
        <div className="space-y-5">
          {grouped.map((group, gi) => (
            <div key={group.id ?? `ungrouped-${gi}`}>
              {(hasRealGroup || group.id !== null) && (
                <div className="text-xs font-bold uppercase tracking-widest text-gold border-b border-grey-mid/60 pb-1 mb-2">
                  {group.name}
                </div>
              )}
              <div className="space-y-1.5">
                {group.lines.map((line) => (
                  <div key={line.id} className={line.isActive ? '' : 'opacity-40'}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm uppercase">{line.name}</span>
                      <span className="flex items-baseline gap-4 shrink-0">
                        {line.sizes.length > 0 ? (
                          line.sizes.map((s) => (
                            <span key={s.label} className="flex flex-col items-end leading-tight">
                              <span className="text-2xs uppercase text-grey-light">{s.label}</span>
                              <span className="text-sm">{formatSizePrice(s.price)}</span>
                            </span>
                          ))
                        ) : (
                          <span className="text-sm">
                            {line.price != null ? formatSizePrice(line.price) : line.unit ? line.unit : '—'}
                          </span>
                        )}
                      </span>
                    </div>
                    {line.dietaryInfo && (
                      <div className="text-2xs uppercase text-grey-light">{line.dietaryInfo}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
