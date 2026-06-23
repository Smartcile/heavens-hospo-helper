'use client'

import type { ElementData } from '@/components/admin/floorplan-elements'

interface Props {
  selectedElement: ElementData | null
  onChange: (patch: Partial<ElementData>) => void
}

const PRESETS = [
  { w: 60, d: 60, label: '60×60' },
  { w: 80, d: 80, label: '80×80' },
  { w: 120, d: 60, label: '120×60' },
  { w: 200, d: 100, label: '200×100' },
]

export function FloorplanInspector({ selectedElement, onChange }: Props) {
  if (!selectedElement) return null

  return (
    <div className="space-y-3">
      <div>
        <label className="font-mono text-[10px] text-grey-light uppercase tracking-wider block mb-1">Width</label>
        <div className="flex items-center gap-2">
          <input type="range" min={20} max={500} step={5}
            value={selectedElement.width}
            onChange={(e) => onChange({ width: parseInt(e.target.value) || 20 })}
            className="flex-1 accent-white h-1" />
          <span className="font-mono text-[10px] text-grey-light w-10 text-right">{Math.round(selectedElement.width)}</span>
        </div>
      </div>
      <div>
        <label className="font-mono text-[10px] text-grey-light uppercase tracking-wider block mb-1">Depth</label>
        <div className="flex items-center gap-2">
          <input type="range" min={20} max={500} step={5}
            value={selectedElement.depth}
            onChange={(e) => onChange({ depth: parseInt(e.target.value) || 20 })}
            className="flex-1 accent-white h-1" />
          <span className="font-mono text-[10px] text-grey-light w-10 text-right">{Math.round(selectedElement.depth)}</span>
        </div>
      </div>
      <div>
        <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider mb-1">Presets</p>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => onChange({ width: p.w, depth: p.d })}
              className={`font-mono text-[10px] px-2 py-1 border transition-colors ${
                selectedElement.width === p.w && selectedElement.depth === p.d
                  ? 'border-white text-white'
                  : 'border-grey-mid text-grey-light hover:border-white'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
