'use client'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { UnderlayPoint } from '@/lib/floorplan-underlay'

interface Props {
  isOpen: boolean
  /** Points already picked, in room centimetres. */
  points: UnderlayPoint[]
  distance: string
  imageSize: { width: number; height: number } | null
  error: string
  onDistanceChange: (value: string) => void
  onReset: () => void
  onApply: () => void
  onCancel: () => void
}

/**
 * Calibration is a floating panel rather than a blocking modal: the operator
 * has to click two points on the drawing underneath it, so the canvas must stay
 * clickable. Clicks themselves are captured by the canvas calibration overlay.
 */
export function FloorplanCalibrationPanel({
  isOpen,
  points,
  distance,
  imageSize,
  error,
  onDistanceChange,
  onReset,
  onApply,
  onCancel,
}: Props) {
  if (!isOpen) return null

  const ready = points.length >= 2 && !!imageSize && Number(distance) > 0

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,540px)] border border-accent bg-black p-3 space-y-2 shadow-lg"
      data-testid="floorplan-calibration"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
          CALIBRATE REFERENCE IMAGE
        </p>
        <button
          onClick={onCancel}
          className="font-mono text-xs uppercase text-grey-light hover:text-white border border-grey-mid px-2 py-1"
        >
          CANCEL
        </button>
      </div>
      <p className="font-mono text-xs text-grey-light">
        CLICK TWO POINTS ON THE IMAGE, THEN ENTER THE REAL DISTANCE BETWEEN THEM.
        THE PLAN IS RESIZED TO THE DRAWING&apos;S FULL EXTENT AT THAT SCALE.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs uppercase text-grey-light">POINTS: {Math.min(points.length, 2)}/2</span>
        {points.slice(0, 2).map((p, i) => (
          <span key={i} className="font-mono text-xs text-white">
            P{i + 1} {Math.round(p.x)},{Math.round(p.y)}
          </span>
        ))}
        <span className="flex-1" />
        <button
          onClick={onReset}
          disabled={points.length === 0}
          className="font-mono text-xs uppercase text-grey-light hover:text-white border border-grey-mid px-2 py-1 disabled:opacity-40"
        >
          RESET POINTS
        </button>
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="w-44">
          <Input
            label="REAL DISTANCE (CM)"
            type="number"
            min="1"
            step="1"
            value={distance}
            onChange={(e) => onDistanceChange(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={onApply} disabled={!ready}>
          APPLY CALIBRATION
        </Button>
      </div>
      {!imageSize && (
        <p className="font-mono text-xs uppercase text-grey-light">LOADING IMAGE…</p>
      )}
      {imageSize && (
        <p className="font-mono text-xs uppercase text-grey-light">
          IMAGE: {imageSize.width}×{imageSize.height} PX
        </p>
      )}
      {error && <p className="font-mono text-xs uppercase text-danger">{error}</p>}
    </div>
  )
}
