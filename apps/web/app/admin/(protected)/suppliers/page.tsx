import { SuppliersClient } from './SuppliersClient'

export const dynamic = 'force-dynamic'

export default function SuppliersPage() {
  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <SuppliersClient />
    </div>
  )
}
