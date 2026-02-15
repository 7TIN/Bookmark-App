import { BookmarksDashboard } from '@/components/bookmarks-dashboard'
import { prisma } from '@/lib/prisma'
import { syncProfileFromAuthUser } from '@/lib/server/profile'
import { createServerSupabaseClient } from '@/lib/supabase/ssr-server'
import { redirect } from 'next/navigation'

type Bookmark = {
  id: string
  user_id: string
  title: string
  url: string
  created_at: string
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  let bookmarks: Bookmark[] = []
  let bookmarksError: string | null = null

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

  return (
    <BookmarksDashboard
      userId={user.id}
      userEmail={user.email ?? ''}
      initialBookmarks={bookmarks}
      initialError={bookmarksError}
    />
  )
}
