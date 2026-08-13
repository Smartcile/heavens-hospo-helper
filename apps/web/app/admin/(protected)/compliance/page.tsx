import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'
import { ComplianceClient } from '@/components/admin/ComplianceClient'

export default async function CompliancePage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const activeVenueId = cookies().get('admin-active-venue')?.value ?? session.user.defaultVenueId ?? undefined

  return (
    <ComplianceClient
      role={session.user.role}
      sessionVenueId={session.user.venueId}
      defaultVenueId={activeVenueId}
    />
  )
}
