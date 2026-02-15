'use client'

import { BookmarkCard } from '@/components/bookmark-card'
import { useTheme } from '@/components/theme-provider'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import {
  Bookmark,
  ExternalLink,
  Grid3X3,
  LayoutList,
  Link2,
  LogOut,
  Moon,
  Plus,
  Sun,
  Trash2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useMemo, useState } from 'react'

type BookmarkItem = {
  id: string
  user_id: string
  title: string
  url: string
  created_at: string
}

type BookmarksDashboardProps = {
  initialBookmarks: BookmarkItem[]
  userId: string
  userEmail: string
  initialError?: string | null
}

type ViewMode = 'grid' | 'list'

function normalizeUrl(rawValue: string) {
  const value = rawValue.trim()
  if (!value) return null

  try {
    return new URL(value).toString()
  } catch {
    try {
      return new URL(`https://${value}`).toString()
    } catch {
      return null
    }
  }
}

function sortByCreatedAtDesc(items: BookmarkItem[]) {
  return [...items].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

function upsertBookmark(items: BookmarkItem[], nextBookmark: BookmarkItem) {
  const withoutCurrent = items.filter((item) => item.id !== nextBookmark.id)
  return sortByCreatedAtDesc([nextBookmark, ...withoutCurrent])
}

function reduceRealtimeEvent(
  current: BookmarkItem[],
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
) {
  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    const nextBookmark = payload.new as BookmarkItem
    if (!nextBookmark?.id) return current
    return upsertBookmark(current, nextBookmark)
  }

  if (payload.eventType === 'DELETE') {
    const previousBookmark = payload.old as Partial<BookmarkItem>
    if (!previousBookmark?.id) return current
    return current.filter((item) => item.id !== previousBookmark.id)
  }

  return current
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function BookmarksDashboard({
  initialBookmarks,
  userId,
  userEmail,
  initialError = null,
}: BookmarksDashboardProps) {
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(sortByCreatedAtDesc(initialBookmarks))
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError)
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING')

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    setBookmarks(sortByCreatedAtDesc(initialBookmarks))
  }, [initialBookmarks])

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`bookmarks:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookmarks',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setBookmarks((current) => reduceRealtimeEvent(current, payload))
        }
      )
      .subscribe((status) => {
        setRealtimeStatus(status)
      })

    return () => {
      supabase.removeChannel(channel).catch(() => undefined)
    }
  }, [userId])

  const realtimeLabel = useMemo(() => {
    if (realtimeStatus === 'SUBSCRIBED') return 'Live'
    if (realtimeStatus === 'CHANNEL_ERROR') return 'Channel error'
    if (realtimeStatus === 'TIMED_OUT') return 'Timed out'
    if (realtimeStatus === 'CLOSED') return 'Disconnected'
    return 'Connecting'
  }, [realtimeStatus])

  const userInitial = (userEmail.charAt(0) || userId.charAt(0) || 'U').toUpperCase()
  const userLabel = userEmail || userId

  async function handleAddBookmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    const normalizedUrl = normalizeUrl(url)
    if (!title.trim()) {
      setErrorMessage('Title is required.')
      return
    }

    if (!normalizedUrl) {
      setErrorMessage('Please enter a valid URL.')
      return
    }

    setIsSubmitting(true)

    const response = await fetch('/api/bookmarks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title.trim(),
        url: normalizedUrl,
      }),
    })

    const result = (await response.json().catch(() => null)) as
      | { bookmark?: BookmarkItem; error?: string }
      | null
    const createdBookmark = result?.bookmark

    if (!response.ok || !createdBookmark) {
      setErrorMessage(result?.error ?? 'Failed to add bookmark.')
      setIsSubmitting(false)
      return
    }

    setBookmarks((current) => upsertBookmark(current, createdBookmark))
    setTitle('')
    setUrl('')
    setIsAdding(false)
    setIsSubmitting(false)
  }

  async function handleDeleteBookmark(id: string) {
    setErrorMessage(null)
    setDeletingId(id)

    const response = await fetch(`/api/bookmarks/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null
      setErrorMessage(result?.error ?? 'Failed to delete bookmark.')
      setDeletingId(null)
      return
    }

    setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))
    setDeletingId(null)
  }

  async function handleSignOut() {
    setErrorMessage(null)
    setIsSigningOut(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
      setErrorMessage(error.message)
      setIsSigningOut(false)
      return
    }

    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-foreground" />
            <span className="text-sm font-semibold tracking-tight text-foreground">Bookmarks</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Toggle theme"
            >
              {!isMounted ? (
                <span className="block h-3.5 w-3.5" />
              ) : theme === 'light' ? (
                <Moon className="h-3.5 w-3.5" />
              ) : (
                <Sun className="h-3.5 w-3.5" />
              )}
            </button>

            <div className="mx-1 h-4 w-px bg-border" />

            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                <span className="text-xs font-medium text-muted-foreground">{userInitial}</span>
              </div>
              <span className="hidden text-sm text-muted-foreground sm:inline">{userLabel}</span>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Log out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Your Bookmarks</h1>
            <p className="text-sm text-muted-foreground">
              {bookmarks.length} saved link{bookmarks.length !== 1 ? 's' : ''} - {realtimeLabel}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-border">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded-l-md p-1.5 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label="Grid view"
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`rounded-r-md p-1.5 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label="List view"
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsAdding((current) => !current)
                setErrorMessage(null)
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>

        {isAdding ? (
          <div className="mb-6 animate-fade-in rounded-md border border-border bg-card p-4">
            <form onSubmit={handleAddBookmark} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. React Documentation"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://react.dev"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || !title.trim() || !url.trim()}
                  className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting ? 'Saving...' : 'Save Bookmark'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false)
                    setTitle('')
                    setUrl('')
                    setErrorMessage(null)
                  }}
                  className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mb-6 rounded-md border border-border bg-card px-3 py-2 text-xs text-destructive">
            {errorMessage}
          </div>
        ) : null}

        {bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Link2 className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No bookmarks yet</p>
            <p className="text-sm text-muted-foreground">Click &quot;Add&quot; to save your first bookmark.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bookmarks.map((bookmark, index) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                index={index}
                isDeleting={deletingId === bookmark.id}
                onDelete={handleDeleteBookmark}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {bookmarks.map((bookmark, index) => (
              <div
                key={bookmark.id}
                className="group animate-fade-in flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-foreground">{bookmark.title}</span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="truncate text-xs text-muted-foreground">{getDomain(bookmark.url)}</span>
                    <span className="text-xs text-muted-foreground/50">-</span>
                    <span className="text-xs text-muted-foreground/70">{formatDate(bookmark.created_at)}</span>
                  </div>
                </div>

                <div className="ml-4 flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={`Open ${bookmark.title}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDeleteBookmark(bookmark.id)}
                    disabled={deletingId === bookmark.id}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Delete ${bookmark.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 border-t border-border pt-6 text-center">
          <p className="text-xs text-muted-foreground/60">
            Smart Bookmark - Real-time sync across tabs - Private per user
          </p>
        </div>
      </main>
    </div>
  )
}
