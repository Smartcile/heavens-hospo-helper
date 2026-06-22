import { InventoryClient } from './InventoryClient'

export const dynamic = 'force-dynamic'

export default function InventoryPage() {
  return (
    <div className="min-h-screen bg-black p-6">
      <InventoryClient />
    </div>
  )
}
