'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export function GoogleSignInButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSignIn() {
    setIsLoading(true)
    setErrorMessage(null)

    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    })

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={isLoading}
        className="inline-flex h-10 w-full items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-neutral-100 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? 'Redirecting...' : 'Continue with Google'}
      </button>
      {errorMessage ? <p className="text-sm text-neutral-400">{errorMessage}</p> : null}
    </div>
  )
}
