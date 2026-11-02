'use client'

// Renders an image with its annotation layer drawn on top. The layer is pure
// data (shapes + texts); the picture file is never modified, so removing the
// layer restores the clean image everywhere.
//
// The overlay is an SVG whose viewBox is the image's natural pixel size, so
// geometry is preserved at every display size. Shared by the pickers, the
// guide reader and the annotator's live preview.

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  annotationPlateFill,
  annotationTextBounds,
  plotArrow,
  selectionBounds,
  type AnnotationData,
  type AnnotationShape,
  type AnnotationSelection,
} from '@/lib/image-annotations'
import { thumbUrl } from '@/lib/image-thumb'

/** The SVG layer for one annotation, drawn in image-pixel units. */
export function AnnotationShapes({
  data,
  draft,
  selection,
  width,
  height,
  className,
}: {
  data: AnnotationData
  /** In-progress shape shown while dragging in the annotator. */
  draft?: AnnotationShape | null
  /** The annotation currently selected in the annotator — draws its outline. */
  selection?: AnnotationSelection | null
  width: number
  height: number
  className?: string
}) {
  const shapes = draft ? [...data.shapes, draft] : data.shapes
  const selected = selection ? selectionBounds(data, selection, width, height) : null
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    >
      {shapes.map((s, i) => (
        <AnnotationShapeVisual key={i} shape={s} w={width} h={height} />
      ))}
      {data.texts.map((t, i) => {
        const b = annotationTextBounds(t, width, height)
        const font = Math.max(1, t.size * height)
        return (
          <g key={`t${i}`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h * 0.22} fill={annotationPlateFill(t.color)} />
            <text
              x={t.x * width + font * 0.28}
              y={t.y * height}
              fill={t.color}
              fontSize={font}
              fontFamily="ui-monospace, monospace"
              fontWeight="bold"
            >
              {t.text}
            </text>
          </g>
        )
      })}
      {selected && (
        <rect
          x={selected.x}
          y={selected.y}
          width={selected.w}
          height={selected.h}
          fill="none"
          stroke="#60A5FA"
          strokeWidth={Math.max(1, height * 0.004)}
          strokeDasharray={`${Math.max(3, height * 0.012)} ${Math.max(2, height * 0.008)}`}
        />
      )}
    </svg>
  )
}

function AnnotationShapeVisual({ shape, w, h }: { shape: AnnotationShape; w: number; h: number }) {
  const stroke = {
    fill: 'none',
    stroke: shape.color,
    strokeWidth: shape.width * h,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  const points = shape.points.map((p) => `${p.x * w},${p.y * h}`).join(' ')

  if (shape.tool === 'pen' || shape.tool === 'line') {
    return <polyline points={points} {...stroke} />
  }

  if (shape.tool === 'arrow') {
    // Computed in pixel space so the head keeps its proportions on any image
    // aspect ratio; the shaft stops at the head's base (no round-cap blob).
    const { shaft, head } = plotArrow(shape.points[0], shape.points[1], w, h, shape.width)
    return (
      <>
        <line x1={shaft[0].x} y1={shaft[0].y} x2={shaft[1].x} y2={shaft[1].y} {...stroke} />
        <polygon points={head.map((p) => `${p.x},${p.y}`).join(' ')} fill={shape.color} />
      </>
    )
  }

  const [a, b] = shape.points
  return (
    <rect
      x={Math.min(a.x, b.x) * w}
      y={Math.min(a.y, b.y) * h}
      width={Math.abs(b.x - a.x) * w}
      height={Math.abs(b.y - a.y) * h}
      {...stroke}
    />
  )
}

export function AnnotatedImage({
  src,
  alt = '',
  annotations,
  className,
  imgClassName,
}: {
  src: string
  alt?: string
  annotations?: AnnotationData | null
  className?: string
  imgClassName?: string
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const hasLayer = !!annotations && (annotations.shapes.length > 0 || annotations.texts.length > 0)

  return (
    <span className={cn('relative inline-block', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl(src, 1600) ?? src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn('block', imgClassName)}
        onLoad={(e) => {
          const el = e.currentTarget
          if (el.naturalWidth > 0 && el.naturalHeight > 0) setDims({ w: el.naturalWidth, h: el.naturalHeight })
        }}
      />
      {hasLayer && dims && <AnnotationShapes data={annotations} width={dims.w} height={dims.h} />}
    </span>
  )
}
