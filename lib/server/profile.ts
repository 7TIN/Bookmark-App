import { prisma } from '@/lib/prisma'
import type { User } from '@supabase/supabase-js'

function readUserMetaString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export async function syncProfileFromAuthUser(user: User) {
  const fullName = readUserMetaString(user.user_metadata?.full_name)
  const avatarUrl = readUserMetaString(user.user_metadata?.avatar_url)

  await prisma.profile.upsert({
    where: { id: user.id },
    update: {
      email: user.email ?? null,
      fullName,
      avatarUrl,
    },
    create: {
      id: user.id,
      email: user.email ?? null,
      fullName,
      avatarUrl,
    },
  })
}
