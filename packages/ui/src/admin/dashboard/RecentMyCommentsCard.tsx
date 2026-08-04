import type { MyCommentSummary } from '@kobato/ui/admin/dashboard/types'

import { Button } from '@kobato/ui/components/button'
import { ArrowRightIcon } from 'lucide-react'
import { Link } from 'react-router'

export function RecentMyCommentsCard({ comments }: { comments: MyCommentSummary[] }) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">我的最近评论</h2>
        <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/me/comments" />}>
          <span className="hidden sm:inline">全部评论</span> <ArrowRightIcon data-icon />
        </Button>
      </div>
      {comments.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          你还没有发表过评论，去文章页留下第一条{' '}
          <Link to="/admin/me/comments" className="text-brand hover:underline">
            评论足迹
          </Link>
          。
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3 text-sm">
          {comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                {comment.entity ? (
                  <Link to={comment.entity.permalink} className="truncate text-foreground hover:underline">
                    《{comment.entity.title}》
                  </Link>
                ) : (
                  <span className="truncate text-muted-foreground">(目标已删除)</span>
                )}
                <time
                  dateTime={comment.createdAtIso}
                  className="shrink-0 text-xs text-muted-foreground tabular-nums"
                  title={comment.createdAtIso}
                >
                  {comment.createdAtIso.slice(0, 10)}
                </time>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {comment.isPending ? <span className="mr-2 text-destructive">[待审]</span> : null}
                {comment.excerpt || '(空评论)'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
