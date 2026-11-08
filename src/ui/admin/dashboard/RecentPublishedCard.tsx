import type { ReactNode } from 'react'

import { ArrowRightIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { DraftSummary } from '@/shared/contracts/dashboard'

import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

/** tRich chunks renderer for the "write one" link (module scope — stable). */
function renderNewPostLink(chunks: ReactNode[]): ReactNode {
  return (
    <Link to="/admin/posts/new" className="text-brand hover:underline">
      {chunks}
    </Link>
  )
}

export function RecentPublishedCard({ posts }: { posts: DraftSummary[] }) {
  const { t, tRich } = useI18n()
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">{t('admin.dashboard.published.title')}</h2>
        <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/posts?status=published" />}>
          <span className="hidden sm:inline">{t('admin.dashboard.published.all')}</span> <ArrowRightIcon data-icon />
        </Button>
      </div>
      {posts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {tRich('admin.dashboard.published.empty', {
            link: renderNewPostLink,
          })}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {posts.map((post) => (
            <li key={post.id} className="flex items-center justify-between gap-3">
              <Link to={`/editor/post/${post.id}`} className="truncate text-foreground hover:underline">
                {post.title || t('admin.dashboard.published.untitled')}
              </Link>
              <time
                dateTime={post.updatedAtIso}
                className="shrink-0 text-xs text-muted-foreground tabular-nums"
                title={post.updatedAtIso}
              >
                {post.updatedAtIso.slice(0, 10)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
