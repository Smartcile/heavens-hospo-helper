'use client'

// The guide document exactly as a worker reads it on the phone: title + badges,
// the rich-text body, then the numbered steps with an iFixit-style swipeable
// photo gallery (tap to zoom) and video. Shared by the worker reader and the
// admin VIEW preview so the two can never drift.

import { useRef, useState } from 'react'
import { GuideStepLinks } from '@/components/GuideStepLinks'
import { ReferenceTable, type ReferenceTableRow } from '@/components/ReferenceTable'
import { AnnotatedImage } from '@/components/ui/AnnotatedImage'
import type { GuidePopupVariant } from '@/components/GuidePopup'
import type { ResolvedStepLink } from '@/lib/guide-links'
import { annotationForUrl, type ImageAnnotationLayer } from '@/lib/image-annotations'
import { mergeStepImages } from '@/lib/guide-media'
import type { ReferenceColumn } from '@/lib/reference-table'
import { sanitiseRichText } from '@/lib/rich-text'
import { guideTypeLabel } from '@/lib/guide-types'

export interface GuideReaderStep {
  id: string
  heading: string | null
  content: string
  imageUrl: string | null
  imageUrls?: string[] | null
  videoUrl: string | null
  videoPath?: string | null
  links?: ResolvedStepLink[]
  /** Per-usage annotation layers over this step's photos. */
  imageAnnotations?: ImageAnnotationLayer[] | null
}

export interface GuideReaderGuide {
  title: string
  description: string | null
  category: string | null
  guideType: string | null
  bodyHtml: string | null
  isTracked: boolean
  tableColumns?: ReferenceColumn[] | null
  tableRows?: ReferenceTableRow[] | null
  steps: GuideReaderStep[]
}

/**
 * Swipeable step photos. One image renders exactly as before (tap to zoom);
 * several become a snap-scrolling gallery with prev/next arrow buttons and an
 * "n / N" counter, so a step can show a sequence of photos the way iFixit does
 * and it is obvious on desktop that more photos exist.
 */
function StepGallery({ images, stepNumber, annotations, onOpen }: { images: string[]; stepNumber: number; annotations?: ImageAnnotationLayer[] | null; onOpen: (url: string) => void }) {
  const [current, setCurrent] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)

  if (images.length === 0) return null

  if (images.length === 1) {
    return (
      <button
        type="button"
        onClick={() => onOpen(images[0])}
        aria-label={`View step ${stepNumber} image full size`}
        className="block w-full cursor-zoom-in"
      >
        <AnnotatedImage
          src={images[0]}
          alt={`step ${stepNumber}`}
          annotations={annotationForUrl(annotations, images[0])}
          className="block w-full"
          imgClassName="block w-full h-auto max-w-full border border-grey-mid"
        />
      </button>
    )
  }

  function onScroll() {
    const el = scrollerRef.current
    if (!el || !el.clientWidth) return
    setCurrent(Math.max(0, Math.min(images.length - 1, Math.round(el.scrollLeft / el.clientWidth))))
  }

  function goTo(index: number) {
    const el = scrollerRef.current
    const next = Math.max(0, Math.min(images.length - 1, index))
    setCurrent(next)
    if (el) el.scrollLeft = next * el.clientWidth
  }

  return (
    <div className="relative">
      <div ref={scrollerRef} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth">
        {images.map((url, idx) => (
          <button
            key={url}
            type="button"
            onClick={() => onOpen(url)}
            aria-label={`View step ${stepNumber} image ${idx + 1} full size`}
            className="w-full flex-shrink-0 snap-center cursor-zoom-in"
          >
            <AnnotatedImage
              src={url}
              alt={`step ${stepNumber} image ${idx + 1}`}
              annotations={annotationForUrl(annotations, url)}
              className="block w-full"
              imgClassName="block w-full h-auto max-w-full border border-grey-mid"
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => goTo(current - 1)}
        disabled={current === 0}
        aria-label="Previous image"
        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/70 border border-grey-mid px-2.5 py-3 font-mono text-lg leading-none text-white transition-colors hover:border-white disabled:opacity-30 disabled:cursor-default"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => goTo(current + 1)}
        disabled={current === images.length - 1}
        aria-label="Next image"
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/70 border border-grey-mid px-2.5 py-3 font-mono text-lg leading-none text-white transition-colors hover:border-white disabled:opacity-30 disabled:cursor-default"
      >
        ›
      </button>
      <div className="absolute bottom-2 right-2 bg-black/70 border border-grey-mid px-2 py-0.5 font-mono text-xs text-white">
        {current + 1} / {images.length}
      </div>
    </div>
  )
}

export function GuideReaderContent({ guide, variant = 'admin' }: { guide: GuideReaderGuide; variant?: GuidePopupVariant }) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  return (
    <>
      <div>
        <h1 className="font-mono text-xl font-bold uppercase text-white">{guide.title}</h1>
        {guide.description && <p className="font-sans text-sm text-grey-light mt-2">{guide.description}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {guideTypeLabel(guide.guideType) && <span className="inline-block font-mono text-xs border border-grey-mid px-2 py-0.5 text-white">{guideTypeLabel(guide.guideType)}</span>}
          {guide.category && <span className="inline-block font-mono text-xs border border-grey-mid px-2 py-0.5 text-grey-light">{guide.category}</span>}
          {!guide.isTracked && (
            <span className="inline-block font-mono text-xs border border-grey-mid px-2 py-0.5 text-grey-light">REFERENCE — NOT TRACKED</span>
          )}
        </div>
      </div>

      {guide.bodyHtml && (
        <div
          className="font-sans text-sm text-white leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: sanitiseRichText(guide.bodyHtml) }}
        />
      )}

      {guide.tableColumns && guide.tableColumns.length > 0 && (
        <ReferenceTable columns={guide.tableColumns} rows={guide.tableRows ?? []} />
      )}

      {!(guide.tableColumns && guide.tableColumns.length > 0) && guide.steps.map((s, i) => {
        const images = mergeStepImages(s.imageUrls, s.imageUrl)
        return (
          <div key={s.id} className="border-l-4 border-l-grey-mid pl-4 space-y-2">
            <div className="font-mono text-xs text-grey-light uppercase">
              STEP {i + 1}{s.heading ? ` — ${s.heading}` : ''}
            </div>
            <p className="font-sans text-sm text-white whitespace-pre-wrap break-words">{s.content}</p>
            <StepGallery images={images} stepNumber={i + 1} annotations={s.imageAnnotations} onOpen={setLightbox} />
            {s.videoPath && (
              <video
                src={s.videoPath}
                autoPlay
                loop
                muted
                playsInline
                controls
                className="block w-full max-w-full border border-grey-mid"
              />
            )}
            {s.videoUrl && (
              <a href={s.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-block font-mono text-xs uppercase border border-grey-mid px-3 py-2 text-white hover:border-white transition-colors">
                ▶ WATCH VIDEO
              </a>
            )}
            {s.links && s.links.length > 0 && <GuideStepLinks links={s.links} variant={variant} />}
          </div>
        )
      })}

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-2"
        >
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-full items-center justify-center">
            <AnnotatedImage
              src={lightbox}
              alt=""
              annotations={annotationForUrl(guide.steps.flatMap((s) => s.imageAnnotations ?? []), lightbox)}
              imgClassName="max-h-full max-w-full object-contain"
            />
          </div>
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 font-mono text-xs uppercase border border-grey-mid bg-black/70 px-3 py-2 text-white hover:border-white transition-colors"
          >
            ✕ CLOSE
          </button>
        </div>
      )}
    </>
  )
}
