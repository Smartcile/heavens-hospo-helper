'use client'

import { useWorkerImmersive } from '@/components/worker/useWorkerImmersive'
import { PdfDocumentView } from '@/components/ui/PdfDocumentView'

interface Props {
  cardId: string
  number: string
  onBack: () => void
}

/** Full-screen issued gift card PDF — never leaves the worker in a browser tab. */
export function GiftCardPdfView({ cardId, number, onBack }: Props) {
  useWorkerImmersive(true)

  return (
    <PdfDocumentView
      url={`/api/worker/giftcards/${cardId}/pdf?inline=1`}
      downloadUrl={`/api/worker/giftcards/${cardId}/pdf`}
      filename={`Gift Card - ${number}.pdf`}
      title={`GIFT CARD ${number}`}
      onBack={onBack}
      backLabel="BACK TO CARD"
    />
  )
}
