import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { jwtVerify } from 'jose'

export default async function WorkerAuthLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies()
  const token = cookieStore.get('hospo-worker-session')?.value

  if (!token) {
    redirect('/w/login')
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.WORKER_SESSION_SECRET ?? 'fallback-dev-secret-change-in-prod'
    )
    await jwtVerify(token, secret)
  } catch {
    redirect('/w/login')
  }

  return <>{children}</>
}
