import { ArrowRightIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { DraftSummary } from '@/ui/admin/dashboard/types'

import { Button } from '@/ui/components/button'

export function RecentPublishedCard({ posts }: { posts: DraftSummary[] }) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">最近发布</h2>
        <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/posts?published=true" />}>
          <span className="hidden sm:inline">全部文章</span> <ArrowRightIcon data-icon />
        </Button>
      </div>
      {posts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">暂无已发布文章。</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {posts.map((post) => (
            <li key={post.id} className="flex items-center justify-between gap-3">
              <Link to={`/editor/post/${post.id}`} className="truncate text-foreground hover:underline">
                {post.title || '(未命名)'}
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
