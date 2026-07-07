import { OrdersClient } from './OrdersClient'

export const dynamic = 'force-dynamic'

export default function OrdersPage() {
  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <OrdersClient />
    </div>
  )
}
