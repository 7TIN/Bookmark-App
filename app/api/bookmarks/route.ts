import { prisma } from '@/lib/prisma'
import { syncProfileFromAuthUser } from '@/lib/server/profile'
import { createServerSupabaseClient } from '@/lib/supabase/ssr-server'
import { NextResponse } from 'next/server'

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

function toBookmarkDto(bookmark: {
  id: string
  userId: string
  title: string
  url: string
  createdAt: Date
}) {
  return {
    id: bookmark.id,
    user_id: bookmark.userId,
    title: bookmark.title,
    url: bookmark.url,
    created_at: bookmark.createdAt.toISOString(),
  }
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await syncProfileFromAuthUser(user)

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    bookmarks: bookmarks.map(toBookmarkDto),
  })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await syncProfileFromAuthUser(user)

  const body = (await request.json().catch(() => null)) as {
    title?: unknown
    url?: unknown
  } | null

  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const normalizedUrl =
    typeof body?.url === 'string' ? normalizeUrl(body.url) : null

  if (!title) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
  }

  if (!normalizedUrl) {
    return NextResponse.json({ error: 'A valid URL is required.' }, { status: 400 })
  }

  const created = await prisma.bookmark.create({
    data: {
      userId: user.id,
      title,
      url: normalizedUrl,
    },
  })

  return NextResponse.json({
    bookmark: toBookmarkDto(created),
  })
}
