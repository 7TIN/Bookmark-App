'use client'
/* eslint-disable react-hooks/set-state-in-effect */

import { BookmarkCard } from '@/components/bookmark-card'
import { useTheme } from '@/components/theme-provider'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import {
  Bookmark,
  CloudUpload,
  ExternalLink,
  Grid3X3,
  LayoutList,
  Link2,
  LogIn,
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

type DashboardMode = 'authenticated' | 'guest'

type BookmarksDashboardProps = {
  mode: DashboardMode
  initialBookmarks: BookmarkItem[]
  userId?: string
  userEmail?: string
  initialError?: string | null
}

type ViewMode = 'grid' | 'list'

const LOCAL_BOOKMARKS_STORAGE_KEY = 'bookmark-local-bookmarks-v1'
const ONBOARDING_STORAGE_KEY = 'bookmark-onboarding-complete'

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

function readLocalBookmarks() {
  if (typeof window === 'undefined') return [] as BookmarkItem[]

  const rawValue = window.localStorage.getItem(LOCAL_BOOKMARKS_STORAGE_KEY)
  if (!rawValue) return [] as BookmarkItem[]

  const parsedValue = JSON.parse(rawValue)
  if (!Array.isArray(parsedValue)) return [] as BookmarkItem[]

  const normalizedBookmarks = parsedValue
    .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
    .map((value) => {
      const id = typeof value.id === 'string' ? value.id : null
      const title = typeof value.title === 'string' ? value.title : null
      const url = typeof value.url === 'string' ? value.url : null
      const createdAt = typeof value.created_at === 'string' ? value.created_at : null
      const userId = typeof value.user_id === 'string' ? value.user_id : 'local'

      if (!id || !title || !url || !createdAt) return null

      return {
        id,
        user_id: userId,
        title,
        url,
        created_at: createdAt,
      }
    })
    .filter((value): value is BookmarkItem => value !== null)

  return sortByCreatedAtDesc(normalizedBookmarks)
}

function writeLocalBookmarks(bookmarks: BookmarkItem[]) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LOCAL_BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks))
}

function markOnboardingComplete() {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
}

function hasCompletedOnboarding() {
  if (typeof window === 'undefined') return false

  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1'
}

function buildBookmarkKey(bookmark: Pick<BookmarkItem, 'title' | 'url'>) {
  const normalizedUrl = normalizeUrl(bookmark.url) ?? bookmark.url.trim().toLowerCase()
  return `${bookmark.title.trim().toLowerCase()}::${normalizedUrl.toLowerCase()}`
}

function getUnsyncedLocalBookmarks(localBookmarks: BookmarkItem[], cloudBookmarks: BookmarkItem[]) {
  const cloudKeys = new Set(cloudBookmarks.map((bookmark) => buildBookmarkKey(bookmark)))
  const seenLocalKeys = new Set<string>()
  const unsyncedBookmarks: BookmarkItem[] = []

  for (const localBookmark of localBookmarks) {
    const key = buildBookmarkKey(localBookmark)

    if (cloudKeys.has(key)) continue
    if (seenLocalKeys.has(key)) continue

    seenLocalKeys.add(key)
    unsyncedBookmarks.push(localBookmark)
  }

  return unsyncedBookmarks
}

function createLocalBookmark(title: string, normalizedUrl: string): BookmarkItem {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'local',
    title,
    url: normalizedUrl,
    created_at: new Date().toISOString(),
  }
}

export function BookmarksDashboard({
  mode,
  initialBookmarks,
  userId,
  userEmail,
  initialError = null,
}: BookmarksDashboardProps) {
  const router = useRouter()
  const { theme, toggle } = useTheme()

  const isAuthenticated = mode === 'authenticated' && Boolean(userId)

  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(sortByCreatedAtDesc(initialBookmarks))
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isSyncingLocal, setIsSyncingLocal] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [hasResolvedGuestSetup, setHasResolvedGuestSetup] = useState(mode !== 'guest')
  const [isOnboardingVisible, setIsOnboardingVisible] = useState(mode === 'guest')
  const [pendingLocalSyncCount, setPendingLocalSyncCount] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING')

  const shouldShowGuestLoader = mode === 'guest' && !hasResolvedGuestSetup
  const shouldShowOnboarding = mode === 'guest' && isOnboardingVisible

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return

    setBookmarks(sortByCreatedAtDesc(initialBookmarks))
  }, [initialBookmarks, isAuthenticated])

  useEffect(() => {
    if (mode !== 'guest') return

    const localBookmarks = readLocalBookmarks()
    setBookmarks(localBookmarks)
    setIsOnboardingVisible(!hasCompletedOnboarding())
    setHasResolvedGuestSetup(true)
  }, [mode])

  useEffect(() => {
    if (mode !== 'guest' || !hasResolvedGuestSetup) return

    writeLocalBookmarks(bookmarks)
  }, [bookmarks, mode, hasResolvedGuestSetup])

  useEffect(() => {
    if (!isAuthenticated || !userId) return

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
  }, [isAuthenticated, userId])

  useEffect(() => {
    if (!isAuthenticated) {
      setPendingLocalSyncCount(0)
      return
    }

    const localBookmarks = readLocalBookmarks()
    const unsyncedBookmarks = getUnsyncedLocalBookmarks(localBookmarks, bookmarks)
    setPendingLocalSyncCount(unsyncedBookmarks.length)

    if (localBookmarks.length > 0 && unsyncedBookmarks.length === 0) {
      writeLocalBookmarks([])
    }
  }, [bookmarks, isAuthenticated])

  const realtimeLabel = useMemo(() => {
    if (!isAuthenticated) return 'Local'
    if (realtimeStatus === 'SUBSCRIBED') return 'Live'
    if (realtimeStatus === 'CHANNEL_ERROR') return 'Channel error'
    if (realtimeStatus === 'TIMED_OUT') return 'Timed out'
    if (realtimeStatus === 'CLOSED') return 'Disconnected'
    return 'Connecting'
  }, [isAuthenticated, realtimeStatus])

  const userInitial = isAuthenticated
    ? (userEmail?.charAt(0) || userId?.charAt(0) || 'U').toUpperCase()
    : 'L'

  const userLabel = isAuthenticated ? userEmail || userId || '' : 'Local storage mode'

  async function handleSignIn() {
    setErrorMessage(null)
    setStatusMessage(null)
    setIsSigningIn(true)

    markOnboardingComplete()

    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    })

    if (error) {
      setErrorMessage(error.message)
      setIsSigningIn(false)
    }
  }

  function handleSkipOnboarding() {
    markOnboardingComplete()
    setIsOnboardingVisible(false)
    setStatusMessage('You are using local storage mode. You can sync after login anytime.')
  }

  async function handleAddBookmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setStatusMessage(null)

    const normalizedUrl = normalizeUrl(url)
    if (!title.trim()) {
      setErrorMessage('Title is required.')
      return
    }

    if (!normalizedUrl) {
      setErrorMessage('Please enter a valid URL.')
      return
    }

    if (!isAuthenticated) {
      const localBookmark = createLocalBookmark(title.trim(), normalizedUrl)
      setBookmarks((current) => upsertBookmark(current, localBookmark))
      setTitle('')
      setUrl('')
      setIsAdding(false)
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
    setStatusMessage(null)

    if (!isAuthenticated) {
      setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))
      return
    }

    setDeletingId(id)

    const response = await fetch(`/api/bookmarks/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null
      setErrorMessage(result?.error ?? 'Failed to delete bookmark.')
      setDeletingId(null)
      return
    }

    setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))
    setDeletingId(null)
  }

  async function handleSyncLocalBookmarks() {
    if (!isAuthenticated) return

    setErrorMessage(null)
    setStatusMessage(null)
    setIsSyncingLocal(true)

    const localBookmarks = readLocalBookmarks()
    const unsyncedBookmarks = getUnsyncedLocalBookmarks(localBookmarks, bookmarks)

    if (unsyncedBookmarks.length === 0) {
      writeLocalBookmarks([])
      setPendingLocalSyncCount(0)
      setStatusMessage('Local bookmarks are already synced.')
      setIsSyncingLocal(false)
      return
    }

    const failedBookmarks: BookmarkItem[] = []
    let syncedCount = 0

    for (const localBookmark of unsyncedBookmarks) {
      const response = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: localBookmark.title,
          url: localBookmark.url,
        }),
      })

      const result = (await response.json().catch(() => null)) as
        | { bookmark?: BookmarkItem; error?: string }
        | null

      if (!response.ok || !result?.bookmark) {
        failedBookmarks.push(localBookmark)
        continue
      }

      syncedCount += 1
      setBookmarks((current) => upsertBookmark(current, result.bookmark!))
    }

    writeLocalBookmarks(failedBookmarks)
    setPendingLocalSyncCount(failedBookmarks.length)
    setIsSyncingLocal(false)

    if (failedBookmarks.length > 0) {
      setErrorMessage(
        `Synced ${syncedCount} bookmark${syncedCount === 1 ? '' : 's'}. ${failedBookmarks.length} failed.`
      )
      return
    }

    setStatusMessage(`Synced ${syncedCount} local bookmark${syncedCount === 1 ? '' : 's'} to your account.`)
  }

  async function handleSignOut() {
    setErrorMessage(null)
    setStatusMessage(null)
    setIsSigningOut(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
      setErrorMessage(error.message)
      setIsSigningOut(false)
      return
    }

    router.replace('/dashboard')
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

            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogIn className="h-3.5 w-3.5" />
                {isSigningIn ? 'Redirecting...' : 'Login'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {shouldShowGuestLoader ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            Loading your local bookmarks...
          </div>
        ) : shouldShowOnboarding ? (
          <section className="mx-auto max-w-md rounded-md border border-border bg-card p-6">
            <h1 className="text-lg font-semibold text-foreground">Choose your mode</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Start with Google login and cloud sync, or skip and store bookmarks locally in this browser.
            </p>
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                {isSigningIn ? 'Redirecting...' : 'Continue with Google'}
              </button>
              <button
                type="button"
                onClick={handleSkipOnboarding}
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Skip login and use local storage
              </button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground/70">
              If you skip now, you can sync local bookmarks to your account anytime after login.
            </p>
          </section>
        ) : (
          <>
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

                {isAuthenticated && pendingLocalSyncCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleSyncLocalBookmarks}
                    disabled={isSyncingLocal}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CloudUpload className="h-3.5 w-3.5" />
                    {isSyncingLocal ? 'Syncing...' : `Sync Local (${pendingLocalSyncCount})`}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setIsAdding((current) => !current)
                    setErrorMessage(null)
                    setStatusMessage(null)
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
                        setStatusMessage(null)
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
              <div className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-destructive">
                {errorMessage}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="mb-6 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                {statusMessage}
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
                {isAuthenticated
                  ? 'Smart Bookmark - Real-time sync across tabs - Private per user'
                  : 'Smart Bookmark - Local storage mode - Login anytime to sync'}
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
