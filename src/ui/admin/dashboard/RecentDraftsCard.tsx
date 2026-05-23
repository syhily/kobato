import { ArrowRightIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { DraftSummary } from '@/ui/admin/dashboard/types'

import { Button } from '@/ui/components/button'

export function RecentDraftsCard({ drafts }: { drafts: DraftSummary[] }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">最近草稿</h2>
        <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/posts?published=false" />}>
          <span className="hidden sm:inline">全部草稿</span> <ArrowRightIcon data-icon />
        </Button>
      </div>
      {drafts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">暂无草稿，去 创建一篇 吧。</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex items-center justify-between gap-3">
              <Link to={`/editor/post/${draft.id}`} className="truncate text-foreground hover:underline">
                {draft.title || '(未命名草稿)'}
              </Link>
              <time
                dateTime={draft.updatedAtIso}
                className="shrink-0 text-xs text-muted-foreground tabular-nums"
                title={draft.updatedAtIso}
              >
                {draft.updatedAtIso.slice(0, 10)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
