import { BookmarksDashboard } from '@/components/bookmarks-dashboard'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { SignOutButton } from '@/components/sign-out-button'
import { prisma } from '@/lib/prisma'
import { syncProfileFromAuthUser } from '@/lib/server/profile'
import { createServerSupabaseClient } from '@/lib/supabase/ssr-server'

type Bookmark = {
  id: string
  user_id: string
  title: string
  url: string
  created_at: string
}

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let bookmarks: Bookmark[] = []
  let bookmarksError: string | null = null

  if (user) {
    try {
      await syncProfileFromAuthUser(user)

      const bookmarkRows = await prisma.bookmark.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      })

      bookmarks = bookmarkRows.map((bookmark) => ({
        id: bookmark.id,
        user_id: bookmark.userId,
        title: bookmark.title,
        url: bookmark.url,
        created_at: bookmark.createdAt.toISOString(),
      }))
    } catch {
      bookmarksError = 'Failed to load bookmarks.'
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-8 border-b border-neutral-800 pb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Smart Bookmark App</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Private, Realtime Bookmarks</h1>
          <p className="mt-3 text-sm text-neutral-400">
            Google authentication, private rows, and live sync across tabs.
          </p>
        </header>

        {!user ? (
          <section className="rounded-md border border-neutral-800 bg-neutral-950 p-6">
            <h2 className="text-lg font-medium">Sign in</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Use Google OAuth to access your private bookmark workspace.
            </p>
            <div className="mt-6 max-w-sm">
              <GoogleSignInButton />
            </div>
          </section>
        ) : (
          <section className="space-y-6">
            <div className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-950 p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-neutral-500">Signed in as</p>
                <p className="mt-1 text-sm text-neutral-200">{user.email ?? user.id}</p>
              </div>
              <SignOutButton />
            </div>

            <BookmarksDashboard
              initialBookmarks={bookmarks}
              userId={user.id}
              initialError={bookmarksError}
            />
          </section>
        )}
      </div>
    </main>
  )
}
