'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SignOutButton() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSignOut() {
    setIsLoading(true)
    setErrorMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
      return
    }

    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isLoading}
        className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm font-medium text-neutral-100 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? 'Signing out...' : 'Sign out'}
      </button>
      {errorMessage ? <p className="text-xs text-neutral-400">{errorMessage}</p> : null}
    </div>
  )
}
