import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { createServerSupabaseClient } from '@/lib/supabase/ssr-server'
import { Bookmark } from 'lucide-react'
import { redirect } from 'next/navigation'

type LoginPageProps = {
  searchParams: Promise<{ error?: string }> | { error?: string }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await Promise.resolve(searchParams)

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-border">
            <Bookmark className="h-5 w-5 text-foreground" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Smart Bookmark</h1>
          <p className="mt-1 text-sm text-muted-foreground">Save and organize your links.</p>
        </div>

        <section className="rounded-md border border-border bg-card p-6">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Sign in</h2>
          <p className="mb-6 text-xs text-muted-foreground">
            Continue with your Google account to get started.
          </p>
          {params.error === 'auth_callback_failed' ? (
            <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-xs text-destructive">
              Google login could not be completed. Please try again.
            </p>
          ) : null}
          <GoogleSignInButton />
        </section>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          By continuing, you agree to our Terms of Service.
        </p>
      </div>
    </main>
  )
}
