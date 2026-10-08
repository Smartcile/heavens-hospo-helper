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
import { arrowHead, type AnnotationData, type AnnotationShape } from '@/lib/image-annotations'

/** The SVG layer for one annotation, drawn in image-pixel units. */
export function AnnotationShapes({
  data,
  draft,
  width,
  height,
  className,
}: {
  data: AnnotationData
  /** In-progress shape shown while dragging in the annotator. */
  draft?: AnnotationShape | null
  width: number
  height: number
  className?: string
}) {
  const shapes = draft ? [...data.shapes, draft] : data.shapes
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    >
      {shapes.map((s, i) => (
        <AnnotationShapeVisual key={i} shape={s} w={width} h={height} />
      ))}
      {data.texts.map((t, i) => (
        <text
          key={`t${i}`}
          x={t.x * width}
          y={t.y * height}
          fill={t.color}
          fontSize={t.size * height}
          fontFamily="ui-monospace, monospace"
          style={{ paintOrder: 'stroke', stroke: 'rgba(10,10,10,0.55)', strokeWidth: t.size * height * 0.12 }}
        >
          {t.text}
        </text>
      ))}
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
    const head = arrowHead(shape.points[0], shape.points[1], shape.width * 4)
    return (
      <>
        <polyline points={points} {...stroke} />
        <polygon points={head.map((p) => `${p.x * w},${p.y * h}`).join(' ')} fill={shape.color} />
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
        src={src}
        alt={alt}
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
