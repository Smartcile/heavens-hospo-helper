import { TemplatesClient } from '@/components/admin/TemplatesClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function TemplatesPage() {
  const session = await getServerSession(authOptions)
  return <TemplatesClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
