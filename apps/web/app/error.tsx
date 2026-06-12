'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-4">
        <div className="border-l-4 border-l-danger pl-4">
          <h1 className="font-mono text-lg font-bold uppercase text-danger">ERROR</h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">
            SOMETHING WENT WRONG
          </p>
        </div>
        <button
          onClick={reset}
          className="font-mono text-xs uppercase text-white border border-grey-mid px-4 py-2 hover:border-white transition-colors"
        >
          TRY AGAIN
        </button>
      </div>
    </div>
  )
}
