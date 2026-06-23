'use client'

interface Props {
  zoom: number
  onZoomChange: (z: number) => void
  showDimensions: boolean
  onShowDimensionsChange: (v: boolean) => void
}

export function FloorplanToolbar({ zoom, onZoomChange, showDimensions, onShowDimensionsChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-grey-light">ZOOM</span>
        <input type="range" min={0.2} max={5} step={0.1} value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          className="w-16 accent-white" />
        <span className="font-mono text-[10px] text-grey-light w-10">{Math.round(zoom * 100)}%</span>
      </div>
      <button onClick={() => onShowDimensionsChange(!showDimensions)}
        className={`font-mono text-[10px] uppercase px-2 py-1 border transition-colors ${
          showDimensions ? 'border-accent text-accent bg-accent/10' : 'border-grey-mid text-grey-light hover:border-white'
        }`}>
        {showDimensions ? '[x]' : '[ ]'} DIM
      </button>
    </div>
  )
}
