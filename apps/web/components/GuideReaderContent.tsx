'use client'

// The guide document exactly as a worker reads it on the phone: title + badges,
// the rich-text body, then the numbered steps with photos (tap to zoom) and
// video links. Shared by the worker reader and the admin VIEW preview so the
// two can never drift.

import { useState } from 'react'
import { GuideStepLinks } from '@/components/GuideStepLinks'
import type { ResolvedStepLink } from '@/lib/guide-links'
import { sanitiseRichText } from '@/lib/rich-text'
import { guideTypeLabel } from '@/lib/guide-types'

export interface GuideReaderStep {
  id: string
  heading: string | null
  content: string
  imageUrl: string | null
  videoUrl: string | null
  links?: ResolvedStepLink[]
}

export interface GuideReaderGuide {
  title: string
  description: string | null
  category: string | null
  guideType: string | null
  bodyHtml: string | null
  isTracked: boolean
  steps: GuideReaderStep[]
}

export function GuideReaderContent({ guide }: { guide: GuideReaderGuide }) {
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

      {guide.steps.map((s, i) => (
        <div key={s.id} className="border-l-4 border-l-grey-mid pl-4 space-y-2">
          <div className="font-mono text-xs text-grey-light uppercase">
            STEP {i + 1}{s.heading ? ` — ${s.heading}` : ''}
          </div>
          <p className="font-sans text-sm text-white whitespace-pre-wrap break-words">{s.content}</p>
          {s.imageUrl && (
            <button
              type="button"
              onClick={() => setLightbox(s.imageUrl)}
              aria-label={`View step ${i + 1} image full size`}
              className="block w-full cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.imageUrl} alt={`step ${i + 1}`} className="block w-full h-auto max-w-full border border-grey-mid" />
            </button>
          )}
          {s.videoUrl && (
            <a href={s.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-block font-mono text-xs uppercase border border-grey-mid px-3 py-2 text-white hover:border-white transition-colors">
              ▶ WATCH VIDEO
            </a>
          )}
          {s.links && s.links.length > 0 && <GuideStepLinks links={s.links} />}
        </div>
      ))}

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full object-contain" />
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
