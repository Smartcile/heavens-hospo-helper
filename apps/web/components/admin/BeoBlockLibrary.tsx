'use client'

// The right-hand block library: drag a tile onto the event canvas, or click to
// add. Same HTML5 drag pattern as the furniture palette.

import { useState } from 'react'
import { BEO_BLOCKS, libraryGroups, type BlockLibrary } from '@/lib/beo-blocks'

export const BEO_BLOCK_DRAG_PREFIX = 'beo-block:'

export function BeoBlockLibrary({
  onAdd,
  disabled,
  library = BEO_BLOCKS,
}: {
  onAdd: (type: string) => void
  disabled?: boolean
  library?: BlockLibrary
}) {
  const [group, setGroup] = useState<string>('ALL')
  const groups = ['ALL', ...libraryGroups(library)]
  const shown = group === 'ALL' ? library : library.filter((b) => b.group === group)

  return (
    <div className="border border-grey-mid">
      <div className="px-2 py-1.5 border-b border-grey-mid bg-grey-dark/40">
        <h3 className="font-mono text-[10px] font-bold uppercase text-white tracking-wider">BLOCK LIBRARY</h3>
      </div>

      <div className="p-2 space-y-2">
        <div className="flex flex-wrap gap-1">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`font-mono text-[9px] uppercase px-1.5 py-0.5 border ${
                group === g ? 'border-white text-white bg-grey-mid' : 'border-grey-mid text-grey-light hover:border-white'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          {shown.map((b) => (
            <button
              key={b.type}
              type="button"
              draggable={!disabled}
              disabled={disabled}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', `${BEO_BLOCK_DRAG_PREFIX}${b.type}`)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onAdd(b.type)}
              title={`${b.description} — DRAG OR CLICK TO ADD`}
              className="w-full text-left border border-grey-mid hover:border-white px-2 py-1.5 transition-colors disabled:opacity-40 cursor-grab"
            >
              <span className="block font-mono text-[10px] uppercase text-white">{b.label}</span>
              <span className="block font-mono text-[9px] uppercase text-grey-light truncate">{b.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
