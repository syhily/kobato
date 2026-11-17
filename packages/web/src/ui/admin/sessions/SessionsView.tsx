import type { AdminSessionItem } from '@kobato/shared/types/sessions.ts'
import type { ReactNode } from 'react'

import { useSiteIdentity } from '@kobato/shared/lib/blog-config-context.tsx'
import { DEFAULT_ADMIN_SORT, SESSION_SORT_OPTIONS } from '@kobato/shared/utils/sessions-sort.ts'
import { Badge } from '@kobato/ui/components/badge.tsx'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@kobato/ui/components/empty.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { orpcQuery } from '@kobato/web/client/api/orpc-query.ts'
import { useLogout } from '@kobato/web/client/hooks/use-logout.ts'
import { onMutationError } from '@kobato/web/client/lib/toast-api-error.ts'
import { AdminSessionRow } from '@kobato/web/ui/admin/sessions/AdminSessionRow.tsx'
import { SessionSortSelect } from '@kobato/web/ui/admin/sessions/SessionSortSelect.tsx'
import { useSessionSort } from '@kobato/web/ui/admin/sessions/useSessionSort.ts'
import { AdminListPage } from '@kobato/web/ui/admin/shared/AdminListPage.tsx'
import { type ConfirmState, ConfirmDialog } from '@kobato/web/ui/admin/shared/ConfirmDialog.tsx'
import { useMutation } from '@tanstack/react-query'
import { LogOutIcon, MonitorIcon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'

/** tRich chunks renderer for the active-session count badge (module scope — stable). */
function renderCountBadge(chunks: ReactNode[]): ReactNode {
  return <Badge variant="secondary">{chunks}</Badge>
}

export interface SessionsViewProps {
  items: AdminSessionItem[]
}

export function SessionsView({ items }: SessionsViewProps) {
  const { t, tRich } = useI18n()
  const config = useSiteIdentity()
  const logout = useLogout()
  const revalidator = useRevalidator()
  const revoke = useMutation({
    ...orpcQuery.admin.users.revokeSession.mutationOptions(),
    onSuccess: () => {
      void revalidator.revalidate()
    },
    onError: onMutationError('admin.toast.sessionSignOutFailed', t),
  })
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const { sort, setSort } = useSessionSort({
    defaultSort: DEFAULT_ADMIN_SORT,
    sortOptions: SESSION_SORT_OPTIONS,
  })

  const submitting = revoke.isPending

  const onRevoke = (item: AdminSessionItem) => {
    setConfirm({
      title: item.isCurrent
        ? t('admin.sessions.revokeCurrentTitle')
        : t('admin.sessions.revokeUserTitle', { name: item.userName }),
      description: item.isCurrent
        ? t('admin.sessions.revokeCurrentBody')
        : t('admin.sessions.revokeUserBody', { label: item.label }),
      actionLabel: t('admin.sessions.revoke'),
      destructive: true,
      actionIcon: <LogOutIcon data-icon />,
      onConfirm: () => {
        if (item.isCurrent) {
          void logout('/admin/signin')
          return
        }
        revoke.mutate({ sessionId: item.sid })
      },
    })
  }

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header title={t('admin.sessions.title')} description={t('admin.sessions.description')}>
          <SessionSortSelect sort={sort} options={SESSION_SORT_OPTIONS} onChange={setSort} />
        </AdminListPage.Header>

        <AdminListPage.Body>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {tRich('admin.sessions.count', {
              count: items.length,
              badge: renderCountBadge,
            })}
          </div>
          <div className="mt-3 divide-y">
            {items.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MonitorIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t('admin.sessions.empty')}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              items.map((item) => (
                <AdminSessionRow
                  key={item.sid}
                  item={item}
                  submitting={submitting}
                  onRevoke={onRevoke}
                  config={config}
                />
              ))
            )}
          </div>
        </AdminListPage.Body>
      </AdminListPage>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
