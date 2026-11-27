import type { AdminWebmentionWire } from '@kobato/api/contracts/admin/webmentions'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { orpc } from '@kobato/api/browser/client'
import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { tryParseUrl } from '@kobato/base/utils/safe-url'
import { formatLocalDate } from '@kobato/base/utils/site-date'
import { Badge, type BadgeProps } from '@kobato/ui/components/badge'
import { Button } from '@kobato/ui/components/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@kobato/ui/components/empty'
import { Tabs, TabsList, TabsTrigger } from '@kobato/ui/components/tabs'
import { Tooltip } from '@kobato/ui/components/tooltip'
import { useSiteIdentity } from '@kobato/ui/lib/blog-settings-context'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { AdminInfiniteListFooter } from '@kobato/web-admin/ui/shared/list/AdminInfiniteListFooter'
import { AdminListPage } from '@kobato/web-admin/ui/shared/list/AdminListPage'
import { useAdminInfiniteList } from '@kobato/web-admin/ui/shared/list/use-admin-infinite-list'
import { onMutationError } from '@kobato/web-kit/ui/lib/toast-api-error'
import { useMutation, type InfiniteData } from '@tanstack/react-query'
import { AtSignIcon, CheckIcon, CircleAlertIcon, RefreshCwIcon, XIcon } from 'lucide-react'
import { Fragment, useState } from 'react'

const PAGE_SIZE = 30
const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm:ss'

type StatusFilter = 'all' | AdminWebmentionWire['status']

const STATUS_META: Record<AdminWebmentionWire['status'], { labelId: UiMessageId; variant: BadgeProps['variant'] }> = {
  pending: { labelId: 'admin.webmentions.status.pending', variant: 'secondary' },
  approved: { labelId: 'admin.webmentions.status.approved', variant: 'default' },
  rejected: { labelId: 'admin.webmentions.status.rejected', variant: 'destructive' },
  hidden: { labelId: 'admin.webmentions.status.hidden', variant: 'outline' },
}

const TYPE_META: Record<AdminWebmentionWire['type'], { labelId: UiMessageId }> = {
  mention: { labelId: 'admin.webmentions.type.mention' },
  reply: { labelId: 'admin.webmentions.type.reply' },
  like: { labelId: 'admin.webmentions.type.like' },
  repost: { labelId: 'admin.webmentions.type.repost' },
}

function isStatusFilter(value: unknown): value is StatusFilter {
  return typeof value === 'string' && (value === 'all' || value in STATUS_META)
}

export type AdminWebmentionsPage = Awaited<ReturnType<typeof orpc.admin.webmentions.loadAll>>
export type AdminWebmentionsData = InfiniteData<AdminWebmentionsPage, number>

export function moderateMentionInPages(
  data: AdminWebmentionsData,
  id: string,
  status: 'approved' | 'rejected',
  filter: StatusFilter,
): AdminWebmentionsData {
  return {
    ...data,
    pages: data.pages.map((page) => {
      const hit = page.mentions.find((mention) => mention.id === id)
      if (!hit) {
        return page
      }
      const statusCounts = {
        ...page.statusCounts,
        pending: Math.max(0, page.statusCounts.pending - (hit.status === 'pending' ? 1 : 0)),
        approved: page.statusCounts.approved + (status === 'approved' ? 1 : 0) - (hit.status === 'approved' ? 1 : 0),
        rejected: page.statusCounts.rejected + (status === 'rejected' ? 1 : 0) - (hit.status === 'rejected' ? 1 : 0),
        hidden: Math.max(0, page.statusCounts.hidden - (hit.status === 'hidden' ? 1 : 0)),
      }
      return {
        ...page,
        mentions:
          filter === 'all'
            ? page.mentions.map((mention) => (mention.id === id ? { ...mention, status } : mention))
            : page.mentions.filter((mention) => mention.id !== id),
        statusCounts,
      }
    }),
  }
}

export function applyReverifyToPages(
  data: AdminWebmentionsData,
  row: AdminWebmentionWire,
  filter: StatusFilter,
): AdminWebmentionsData {
  return {
    ...data,
    pages: data.pages.map((page) => {
      const hit = page.mentions.find((mention) => mention.id === row.id)
      if (!hit) {
        return page
      }
      const restored = hit.status === 'hidden' && row.status === 'approved'
      const statusCounts = restored
        ? {
            ...page.statusCounts,
            hidden: Math.max(0, page.statusCounts.hidden - 1),
            approved: page.statusCounts.approved + 1,
          }
        : page.statusCounts
      return {
        ...page,
        mentions:
          restored && filter === 'hidden'
            ? page.mentions.filter((mention) => mention.id !== row.id)
            : page.mentions.map((mention) => (mention.id === row.id ? row : mention)),
        statusCounts,
      }
    }),
  }
}

function authorLabel(mention: AdminWebmentionWire): string {
  if (mention.authorName !== null && mention.authorName !== '') {
    return mention.authorName
  }
  return tryParseUrl(mention.sourceUrl)?.hostname ?? mention.sourceUrl
}

function VerificationBadge({ mention }: { mention: AdminWebmentionWire }) {
  const { t } = useI18n()
  if (mention.verificationStatus === 'verified') {
    return (
      <Badge variant="outline">
        <CheckIcon /> {t('admin.webmentions.verified')}
      </Badge>
    )
  }
  const streak =
    mention.verifyFailStreak > 0 ? t('admin.webmentions.verifyStreak', { days: mention.verifyFailStreak }) : ''
  return (
    <Tooltip>
      <Tooltip.Trigger as="span" className="cursor-help">
        <Badge variant="destructive">
          <CircleAlertIcon /> {t('admin.webmentions.verifyFailed')}
        </Badge>
      </Tooltip.Trigger>
      <Tooltip.Content>
        {mention.lastError ?? t('admin.webmentions.unknownError')}
        {streak}
      </Tooltip.Content>
    </Tooltip>
  )
}

interface InboxRowProps {
  mention: AdminWebmentionWire
  onApprove: (mention: AdminWebmentionWire) => void
  onReject: (mention: AdminWebmentionWire) => void
  onReverify: (mention: AdminWebmentionWire) => void
  isBusy: (mention: AdminWebmentionWire) => boolean
}

function InboxRow({ mention, onApprove, onReject, onReverify, isBusy }: InboxRowProps) {
  const { t } = useI18n()
  const config = useSiteIdentity()
  const meta = STATUS_META[mention.status]
  const busy = isBusy(mention)
  const showReverify =
    mention.status !== 'rejected' && (mention.status === 'hidden' || mention.verificationStatus === 'failed')
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.variant}>{t(meta.labelId)}</Badge>
        <VerificationBadge mention={mention} />
        <Badge variant="outline">{t(TYPE_META[mention.type].labelId)}</Badge>
        <span className="text-sm font-medium">{authorLabel(mention)}</span>
        <a
          href={mention.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-link text-sm break-all hover:underline"
        >
          {mention.title ?? mention.sourceUrl}
        </a>
      </div>
      {mention.summary !== null && <p className="line-clamp-2 text-sm text-muted-foreground">{mention.summary}</p>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-xs break-all text-muted-foreground">
          {t('admin.webmentions.targetAt', {
            url: mention.targetUrl,
            time: formatLocalDate(new Date(mention.createdAt), ADMIN_DATE_FORMAT, config),
          })}
        </p>
        <span className="ml-auto flex shrink-0 gap-2">
          {showReverify && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onReverify(mention)}>
              <RefreshCwIcon /> {t('admin.webmentions.reverify')}
            </Button>
          )}
          {mention.status === 'pending' && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onApprove(mention)}>
                <CheckIcon /> {t('admin.webmentions.approve')}
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => onReject(mention)}>
                <XIcon /> {t('admin.webmentions.reject')}
              </Button>
            </>
          )}
          {mention.status === 'hidden' && (
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => onReject(mention)}>
              <XIcon /> {t('admin.webmentions.reject')}
            </Button>
          )}
        </span>
      </div>
    </div>
  )
}

export function WebmentionInboxView() {
  const { t } = useI18n()
  const [status, setStatus] = useState<StatusFilter>('all')

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef, patchPages } = useAdminInfiniteList({
    namespace: orpcQuery.admin.webmentions.loadAll,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({
      status: status === 'all' ? undefined : status,
      offset,
      limit: PAGE_SIZE,
    }),
    selectRows: (page) => page.mentions,
    noun: 'admin.list.noun.webmentions',
  })

  const approveMutation = useMutation({
    ...orpcQuery.admin.webmentions.approve.mutationOptions(),
    onSuccess: (_result, variables) =>
      patchPages((data) => moderateMentionInPages(data, variables.id, 'approved', status)),
    onError: onMutationError('admin.toast.webmentionApproveFailed', t),
  })
  const rejectMutation = useMutation({
    ...orpcQuery.admin.webmentions.reject.mutationOptions(),
    onSuccess: (_result, variables) =>
      patchPages((data) => moderateMentionInPages(data, variables.id, 'rejected', status)),
    onError: onMutationError('admin.toast.webmentionRejectFailed', t),
  })
  const reverifyMutation = useMutation({
    ...orpcQuery.admin.webmentions.reverify.mutationOptions(),
    onSuccess: (row) => patchPages((data) => applyReverifyToPages(data, row, status)),
    onError: onMutationError('admin.toast.webmentionRevalidateFailed', t),
  })

  const isBusy = (mention: AdminWebmentionWire) =>
    (approveMutation.isPending && approveMutation.variables?.id === mention.id) ||
    (rejectMutation.isPending && rejectMutation.variables?.id === mention.id) ||
    (reverifyMutation.isPending && reverifyMutation.variables?.id === mention.id)

  return (
    <>
      <AdminListPage.Toolbar>
        <Tabs
          value={status}
          onValueChange={(value: unknown) => {
            if (isStatusFilter(value)) {
              setStatus(value)
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="all">{t('common.filter.all')}</TabsTrigger>
            <TabsTrigger value="pending">{t('admin.webmentions.status.pending')}</TabsTrigger>
            <TabsTrigger value="approved">{t('admin.webmentions.status.approved')}</TabsTrigger>
            <TabsTrigger value="rejected">{t('admin.webmentions.status.rejected')}</TabsTrigger>
            <TabsTrigger value="hidden">{t('admin.webmentions.status.hidden')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </AdminListPage.Toolbar>

      <AdminListPage.Body>
        {!isLoading && rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AtSignIcon />
              </EmptyMedia>
              <EmptyTitle>{t('admin.webmentions.emptyInbox')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y">
            {rows.map((mention, index) => {
              const row = (
                <InboxRow
                  mention={mention}
                  onApprove={(m) => approveMutation.mutate({ id: m.id })}
                  onReject={(m) => rejectMutation.mutate({ id: m.id })}
                  onReverify={(m) => reverifyMutation.mutate({ id: m.id })}
                  isBusy={isBusy}
                />
              )
              return index === rows.length - 1 ? (
                <Fragment key={mention.id} ref={sentinelRef}>
                  {row}
                </Fragment>
              ) : (
                <Fragment key={mention.id}>{row}</Fragment>
              )
            })}
          </div>
        )}
        <AdminInfiniteListFooter
          noun={t('admin.list.noun.webmentions')}
          rowCount={total}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      </AdminListPage.Body>
    </>
  )
}
