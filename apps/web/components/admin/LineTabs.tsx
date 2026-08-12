'use client'

import { cn } from '@/lib/utils'
import type { TabDef } from '@/lib/hub-tabs'

interface LineTabsProps {
  tabs: TabDef[]
  tab: string
  sub?: string
  onNavigate: (tab: string, sub?: string) => void
}

/** Sticky line-tab bar shared by the admin hubs: a top row of tabs plus an
 *  optional second row of sub-tabs for the active tab. */
export function LineTabs({ tabs, tab, sub, onNavigate }: LineTabsProps) {
  const tabDef = tabs.find((t) => t.id === tab) ?? tabs[0]

  return (
    <div className="sticky top-0 z-20 bg-black border-b border-grey-mid">
      <div className="flex overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onNavigate(t.id)}
            className={cn(
              'font-mono text-xs uppercase tracking-wider px-4 py-2.5 whitespace-nowrap border-b-2 transition-colors',
              tab === t.id ? 'text-white border-b-white' : 'text-grey-light border-b-transparent hover:text-white',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabDef.subTabs && (
        <div className="flex overflow-x-auto bg-grey-dark/30 border-t border-grey-mid">
          {tabDef.subTabs.map((s) => (
            <button
              key={s.id}
              onClick={() => onNavigate(tab, s.id)}
              className={cn(
                'font-mono text-[10px] uppercase tracking-wider px-4 py-1.5 whitespace-nowrap transition-colors',
                sub === s.id ? 'text-black bg-white' : 'text-grey-light hover:text-white',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
