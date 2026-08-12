import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'
import { TrainingClient } from '@/components/admin/TrainingClient'

export default async function TrainingPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const activeVenueId = cookies().get('admin-active-venue')?.value ?? session.user.defaultVenueId ?? undefined

  return (
    <TrainingClient
      role={session.user.role}
      sessionVenueId={session.user.venueId}
      defaultVenueId={activeVenueId}
    />
  )
}
