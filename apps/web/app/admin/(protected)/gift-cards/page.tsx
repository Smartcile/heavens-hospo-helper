import { GiftCardsClient } from '@/components/admin/GiftCardsClient'

export const dynamic = 'force-dynamic'

export default function GiftCardsPage() {
  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <GiftCardsClient />
    </div>
  )
}
