import { UomsClient } from './UomsClient'

export const dynamic = 'force-dynamic'

export default function UomsPage() {
  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <UomsClient />
    </div>
  )
}
