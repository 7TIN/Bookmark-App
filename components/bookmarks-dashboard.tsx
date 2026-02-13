'use client'

import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { type FormEvent, useEffect, useMemo, useState } from 'react'

type Bookmark = {
  id: string
  user_id: string
  title: string
  url: string
  created_at: string
}

type BookmarksDashboardProps = {
  initialBookmarks: Bookmark[]
  userId: string
  initialError?: string | null
}

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

function sortByCreatedAtDesc(items: Bookmark[]) {
  return [...items].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

function upsertBookmark(items: Bookmark[], nextBookmark: Bookmark) {
  const withoutCurrent = items.filter((item) => item.id !== nextBookmark.id)
  return sortByCreatedAtDesc([nextBookmark, ...withoutCurrent])
}

function reduceRealtimeEvent(
  current: Bookmark[],
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
) {
  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    const nextBookmark = payload.new as Bookmark
    if (!nextBookmark?.id) return current
    return upsertBookmark(current, nextBookmark)
  }

  if (payload.eventType === 'DELETE') {
    const previousBookmark = payload.old as Partial<Bookmark>
    if (!previousBookmark?.id) return current
    return current.filter((item) => item.id !== previousBookmark.id)
  }

  return current
}

export function BookmarksDashboard({
  initialBookmarks,
  userId,
  initialError = null,
}: BookmarksDashboardProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(sortByCreatedAtDesc(initialBookmarks))
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError)
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING')

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

    const supabase = createClient()
    const { data, error } = await supabase
      .from('bookmarks')
      .insert({
        user_id: userId,
        title: title.trim(),
        url: normalizedUrl,
      })
      .select('id, user_id, title, url, created_at')
      .single()

    if (error) {
      setErrorMessage(error.message)
      setIsSubmitting(false)
      return
    }

    setBookmarks((current) => upsertBookmark(current, data as Bookmark))
    setTitle('')
    setUrl('')
    setIsSubmitting(false)
  }

  async function handleDeleteBookmark(id: string) {
    setErrorMessage(null)
    setDeletingId(id)

    const supabase = createClient()
    const { error } = await supabase.from('bookmarks').delete().eq('id', id)

    if (error) {
      setErrorMessage(error.message)
      setDeletingId(null)
      return
    }

    setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))
    setDeletingId(null)
  }

  return (
    <section className="space-y-6">
      <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-100">Bookmarks</h2>
          <span className="text-xs text-neutral-400">{realtimeLabel}</span>
        </div>

        <form onSubmit={handleAddBookmark} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            className="h-10 rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none"
          />
          <input
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="URL"
            className="h-10 rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-10 rounded-md border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-neutral-100 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Adding...' : 'Add'}
          </button>
        </form>

        {errorMessage ? <p className="mt-3 text-sm text-neutral-400">{errorMessage}</p> : null}
      </div>

      <div className="rounded-md border border-neutral-800 bg-neutral-950">
        {bookmarks.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-400">
            No bookmarks yet. Add your first one above.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className="flex items-start justify-between gap-4 px-4 py-4">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium text-neutral-100">{bookmark.title}</p>
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block truncate text-sm text-neutral-400 hover:text-neutral-200"
                  >
                    {bookmark.url}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteBookmark(bookmark.id)}
                  disabled={deletingId === bookmark.id}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 px-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingId === bookmark.id ? 'Deleting...' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
