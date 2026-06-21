'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <h1 className="font-mono text-6xl font-bold text-grey-mid">500</h1>
        <p className="font-mono text-sm uppercase text-grey-light">SOMETHING WENT WRONG</p>
        <p className="font-mono text-xs text-grey-mid">TRY REFRESHING THE PAGE</p>
        <button onClick={() => reset()} className="font-mono text-xs uppercase text-white hover:text-accent transition-colors">
          TRY AGAIN →
        </button>
      </div>
    </div>
  )
}
