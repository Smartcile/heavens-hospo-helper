import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { authOptions } from '@/lib/auth'
import { AdminNav } from '@/components/admin/AdminNav'
import { sessionGrantedAreas } from '@/lib/permissions'

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/')
  }

  const cookieStore = cookies()
  const activeVenueId = cookieStore.get('admin-active-venue')?.value ?? session.user.defaultVenueId ?? null
  const grantedAreas = await sessionGrantedAreas(session, activeVenueId)

  return (
    <div className="flex min-h-screen bg-black">
      <AdminNav
        role={session.user.role}
        venueId={session.user.venueId}
        defaultVenueId={session.user.defaultVenueId ?? null}
        availableVenueIds={session.user.availableVenueIds ?? []}
        grantedAreas={grantedAreas}
      />
      <main className="flex-1 flex flex-col h-screen overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
