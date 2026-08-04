import { cn } from '@kobato/ui/lib/cn'

const SHIMMER_LINE_CLASS =
  'h-4 rounded-input bg-[linear-gradient(90deg,var(--skeleton-start)_0%,var(--skeleton-end)_50%,var(--skeleton-start)_100%)] bg-[length:200%_100%] animate-comments-shimmer motion-reduce:animate-none'

export function CommentsSkeleton() {
  return (
    <div id="comments" className="pt-12" aria-busy="true" aria-live="polite">
      <div className="mb-6 text-xl leading-body font-semibold">
        评论 <small className="font-theme text-sm text-ink-4">(加载中…)</small>
      </div>
      <div className="flex flex-col gap-3">
        <div className={SHIMMER_LINE_CLASS} />
        <div className={cn(SHIMMER_LINE_CLASS, 'w-[60%]')} />
        <div className={SHIMMER_LINE_CLASS} />
      </div>
    </div>
  )
}
