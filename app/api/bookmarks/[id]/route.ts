import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await Promise.resolve(context.params)
  if (!id) {
    return NextResponse.json({ error: 'Bookmark id is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await prisma.bookmark.deleteMany({
    where: {
      id,
      userId: user.id,
    },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: 'Bookmark not found.' }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}
