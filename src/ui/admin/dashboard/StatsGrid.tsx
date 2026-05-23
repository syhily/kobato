import type { LucideIcon } from 'lucide-react'

import { ClockIcon, FileCheck2Icon, FilePenLineIcon, MessageSquareIcon } from 'lucide-react'
import { Link } from 'react-router'

import { cn } from '@/ui/lib/cn'

// Per-card palette. Each tone pairs a soft status bg fill with its
// matching fg (used for the decorative icon) so the four KPI cards
// read as distinct stripes at a glance while staying on the design
// system's status tokens (auto-flips in dark mode).
const TONE_CLASSES = {
  warn: { bg: 'bg-status-warn-bg', icon: 'text-status-warn-fg' },
  success: { bg: 'bg-status-success-bg', icon: 'text-status-success-fg' },
  info: { bg: 'bg-status-info-bg', icon: 'text-status-info-fg' },
  error: { bg: 'bg-status-error-bg', icon: 'text-status-error-fg' },
} as const

type StatCardTone = keyof typeof TONE_CLASSES

interface StatsGridProps {
  stats: {
    draftCount: number
    publishedCount: number
    myCommentsTotal: number
    myCommentsPending: number
  }
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="我的草稿"
        value={stats.draftCount}
        href="/admin/posts?published=false"
        icon={FilePenLineIcon}
        tone="warn"
      />
      <StatCard
        label="已发布文章"
        value={stats.publishedCount}
        href="/admin/posts?published=true"
        icon={FileCheck2Icon}
        tone="success"
      />
      <StatCard
        label="我的评论"
        value={stats.myCommentsTotal}
        href="/admin/me/comments"
        icon={MessageSquareIcon}
        tone="info"
      />
      <StatCard
        label="待审评论"
        value={stats.myCommentsPending}
        href="/admin/me/comments?status=pending"
        emphasis={stats.myCommentsPending > 0}
        icon={ClockIcon}
        tone="error"
      />
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  href: string
  icon: LucideIcon
  tone: StatCardTone
  emphasis?: boolean
}

function StatCard({ label, value, href, icon: Icon, tone, emphasis }: StatCardProps) {
  const palette = TONE_CLASSES[tone]
  return (
    <Link
      to={href}
      className={cn(
        'group relative overflow-hidden rounded-lg border p-4 transition-colors hover:border-line-muted',
        palette.bg,
      )}
    >
      {/* Decorative background icon. Inset on the right (`right-3`) so
          it reads as a watermark, not a banner. Hover scales the glyph
          ~12% as a subtle motion cue; `motion-reduce` variants honour
          the user's reduced-motion preference.
          `pointer-events-none` + `aria-hidden` keep it inert. */}
      <Icon
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 right-3 size-14 -translate-y-1/2 opacity-40 transition-transform duration-200 ease-out group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100',
          palette.icon,
        )}
        strokeWidth={1.5}
      />
      <p className="relative text-xs text-muted-foreground">{label}</p>
      <p className={cn('relative mt-1 text-2xl font-semibold', emphasis ? 'text-destructive' : 'text-foreground')}>
        {value}
      </p>
    </Link>
  )
}
