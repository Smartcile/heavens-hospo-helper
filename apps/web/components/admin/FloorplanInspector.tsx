'use client'

import type { ElementData } from '@/components/admin/floorplan-elements'

interface Props {
  selectedElement: ElementData | null
  elements?: ElementData[]
  onChange: (patch: Partial<ElementData>) => void
}

const PRESETS = [
  { w: 60, d: 60, label: '60×60' },
  { w: 80, d: 80, label: '80×80' },
  { w: 120, d: 60, label: '120×60' },
  { w: 200, d: 100, label: '200×100' },
]

export function FloorplanInspector({ selectedElement, elements, onChange }: Props) {
  if (!selectedElement) return null
  const isPolyBooth = selectedElement.type === 'BOOTH_BENCH' && selectedElement.shape === 'POLYGON'

  return (
    <div className="space-y-3">
      {!isPolyBooth && (
        <>
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
        </>
      )}

      {isPolyBooth && (
        <div className="space-y-3 pt-2 border-t border-grey-mid">
          <div>
            <label className="font-mono text-[10px] text-grey-light uppercase tracking-wider block mb-1">Seat Capacity</label>
            <input type="number" min="0" value={(selectedElement.capacity ?? 0).toString()}
              onChange={(e) => onChange({ capacity: parseInt(e.target.value) || 0 })}
              className="w-full bg-grey-dark border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white" />
          </div>
          <div className="space-y-1">
            <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider">Linked Tables</p>
            {elements && elements.filter((e) => e.type === 'TABLE').map((t) => {
              const served: string[] = (selectedElement.style as any)?.servedTableIds ?? []
              const checked = served.includes(t.id!)
              return (
                <label key={t.id} className="flex items-center gap-2 font-mono text-[10px] text-grey-light cursor-pointer select-none">
                  <input type="checkbox" checked={checked}
                    onChange={() => {
                      const s = [...served]
                      if (checked) { const idx = s.indexOf(t.id!); if (idx >= 0) s.splice(idx, 1) }
                      else { s.push(t.id!) }
                      onChange({ style: { ...(selectedElement.style ?? {}), servedTableIds: s } })
                    }}
                    className="accent-white" />
                  <span>{t.label || t.type}</span>
                </label>
              )
            })}
            {(!elements || elements.filter((e) => e.type === 'TABLE').length === 0) && (
              <p className="font-mono text-[10px] text-grey-light italic">No tables on plan</p>
            )}
          </div>
          <button onClick={() => {
            const served: string[] = (selectedElement.style as any)?.servedTableIds ?? []
            onChange({ capacity: Math.max(1, served.length * 2) })
          }}
            className="font-mono text-[10px] text-accent hover:text-white uppercase border border-accent px-2 py-1 w-full">
            AUTO-CALCULATE (2 SEATS PER TABLE)
          </button>
        </div>
      )}
    </div>
  )
}
