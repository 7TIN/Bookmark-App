import { ExternalLink, Trash2 } from 'lucide-react'

type Bookmark = {
  id: string
  title: string
  url: string
  created_at: string
}

type BookmarkCardProps = {
  bookmark: Bookmark
  index: number
  isDeleting: boolean
  onDelete: (id: string) => void
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash)
  }
  return Math.abs(hash)
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

function HeaderImage({ url, title }: { url: string; title: string }) {
  const seed = hashString(url)
  const letter = title.charAt(0).toUpperCase()

  const patterns = [
    (nextSeed: number) => {
      const size = 12 + (nextSeed % 8)
      const opacity = 0.08 + (nextSeed % 5) * 0.02
      return (
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <pattern
              id={`dots-${nextSeed}`}
              x="0"
              y="0"
              width={size}
              height={size}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={size / 2} cy={size / 2} r="1.5" fill="currentColor" opacity={opacity} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#dots-${nextSeed})`} />
        </svg>
      )
    },
    (nextSeed: number) => {
      const size = 10 + (nextSeed % 6)
      const opacity = 0.06 + (nextSeed % 4) * 0.02
      return (
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <pattern
              id={`lines-${nextSeed}`}
              x="0"
              y="0"
              width={size}
              height={size}
              patternUnits="userSpaceOnUse"
              patternTransform={`rotate(${45 + (nextSeed % 3) * 15})`}
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2={size}
                stroke="currentColor"
                strokeWidth="1"
                opacity={opacity}
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#lines-${nextSeed})`} />
        </svg>
      )
    },
    (nextSeed: number) => {
      const size = 16 + (nextSeed % 8)
      const opacity = 0.05 + (nextSeed % 3) * 0.02
      return (
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <pattern
              id={`grid-${nextSeed}`}
              x="0"
              y="0"
              width={size}
              height={size}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${size} 0 L 0 0 0 ${size}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                opacity={opacity}
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#grid-${nextSeed})`} />
        </svg>
      )
    },
    (nextSeed: number) => {
      const size = 14 + (nextSeed % 6)
      const opacity = 0.07 + (nextSeed % 4) * 0.015
      return (
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <pattern
              id={`cross-${nextSeed}`}
              x="0"
              y="0"
              width={size}
              height={size}
              patternUnits="userSpaceOnUse"
            >
              <line
                x1={size / 2 - 2}
                y1={size / 2}
                x2={size / 2 + 2}
                y2={size / 2}
                stroke="currentColor"
                strokeWidth="1"
                opacity={opacity}
              />
              <line
                x1={size / 2}
                y1={size / 2 - 2}
                x2={size / 2}
                y2={size / 2 + 2}
                stroke="currentColor"
                strokeWidth="1"
                opacity={opacity}
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#cross-${nextSeed})`} />
        </svg>
      )
    },
  ]

  const pattern = patterns[seed % patterns.length]

  return (
    <div className="relative h-28 w-full overflow-hidden bg-muted text-foreground">
      {pattern(seed)}
      <div className="absolute bottom-2 right-3">
        <span className="text-3xl font-bold text-foreground/[0.06]">{letter}</span>
      </div>
    </div>
  )
}

export function BookmarkCard({ bookmark, index, isDeleting, onDelete }: BookmarkCardProps) {
  return (
    <article
      className="group animate-fade-in overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-foreground/20"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <HeaderImage url={bookmark.url} title={bookmark.title} />

      <div className="p-3.5">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-foreground">{bookmark.title}</h3>
        </div>
        <div className="mb-3 flex items-center gap-1.5">
          <span className="truncate text-xs text-muted-foreground">{getDomain(bookmark.url)}</span>
          <span className="text-xs text-muted-foreground/40">-</span>
          <span className="flex-shrink-0 text-xs text-muted-foreground/60">
            {formatDate(bookmark.created_at)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </a>
          <button 
          title='delete'
            type="button"
            onClick={() => onDelete(bookmark.id)}
            disabled={isDeleting}
            className="inline-flex h-7 items-center justify-center rounded-md px-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </article>
  )
}
