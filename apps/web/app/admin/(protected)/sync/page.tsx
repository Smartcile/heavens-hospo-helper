import { SyncClient } from './SyncClient'

export const dynamic = 'force-dynamic'

export default function SyncPage() {
  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <SyncClient />
    </div>
  )
}
