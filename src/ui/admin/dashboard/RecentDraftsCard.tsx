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

export function RecentDraftsCard({ drafts }: { drafts: DraftSummary[] }) {
  const { t, tRich } = useI18n()
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">{t('admin.dashboard.drafts.title')}</h2>
        <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/posts?status=draft" />}>
          <span className="hidden sm:inline">{t('admin.dashboard.drafts.all')}</span> <ArrowRightIcon data-icon />
        </Button>
      </div>
      {drafts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {tRich('admin.dashboard.drafts.empty', {
            link: renderNewPostLink,
          })}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex items-center justify-between gap-3">
              <Link to={`/editor/post/${draft.id}`} className="truncate text-foreground hover:underline">
                {draft.title || t('admin.dashboard.drafts.untitled')}
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
