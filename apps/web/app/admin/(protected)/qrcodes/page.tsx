import { QRCodesClient } from '@/components/admin/QRCodesClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function QRCodesPage() {
  const session = await getServerSession(authOptions)
  return <QRCodesClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
