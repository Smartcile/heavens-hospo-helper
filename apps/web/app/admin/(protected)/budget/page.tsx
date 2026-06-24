import { BudgetLandingClient } from '@/components/admin/BudgetLandingClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function BudgetLandingPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  return <BudgetLandingClient role={session.user.role} sessionVenueId={session.user.venueId} />
}
