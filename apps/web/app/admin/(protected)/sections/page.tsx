import { SectionsClient } from '@/components/admin/SectionsClient'
import { PositionsPanel } from '@/components/admin/PositionsPanel'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function SectionsPage() {
  const session = await getServerSession(authOptions)
  return (
    <>
      <SectionsClient role={session!.user.role} venueId={session!.user.venueId} />
      <div className="px-6 pb-6">
        <PositionsPanel venueId={session!.user.venueId} />
      </div>
    </>
  )
}
