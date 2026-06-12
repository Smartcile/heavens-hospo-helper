import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <h1 className="font-mono text-6xl font-bold text-grey-mid">404</h1>
        <p className="font-mono text-sm uppercase text-grey-light">PAGE NOT FOUND</p>
        <Link href="/admin" className="font-mono text-xs uppercase text-white hover:text-accent transition-colors">
          ← BACK TO DASHBOARD
        </Link>
      </div>
    </div>
  )
}
