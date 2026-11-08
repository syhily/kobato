import { useMutation } from '@tanstack/react-query'
import { LogOutIcon, MonitorIcon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'

import type { MySessionItem } from '@/routes/admin/me/sessions'

import { orpc } from '@/client/api/client'
import { useLogout } from '@/client/hooks/use-logout'
import { onMutationError } from '@/client/lib/toast-api-error'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { DEFAULT_MY_SORT, MY_SESSION_SORT_OPTIONS } from '@/shared/utils/sessions-sort'
import { MySessionRow } from '@/ui/admin/sessions/MySessionRow'
import { SessionSortSelect } from '@/ui/admin/sessions/SessionSortSelect'
import { useSessionSort } from '@/ui/admin/sessions/useSessionSort'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { useI18n } from '@/ui/lib/I18nProvider'

const DATE_FORMAT = 'yyyy-LL-dd HH:mm'

export interface MySessionsViewProps {
  items: MySessionItem[]
}

export function MySessionsView({ items }: MySessionsViewProps) {
  const { t } = useI18n()
  const config = useSiteIdentity()
  const logout = useLogout()
  const revalidator = useRevalidator()
  const revoke = useMutation({
    mutationFn: (vars: { sid: string }) => orpc.account.revokeSession({ id: vars.sid }),
    onSuccess: () => {
      void revalidator.revalidate()
    },
    onError: onMutationError('admin.toast.sessionSignOutFailed', t),
  })
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const { sort, setSort } = useSessionSort({
    defaultSort: DEFAULT_MY_SORT,
    sortOptions: MY_SESSION_SORT_OPTIONS,
  })

  const submitting = revoke.isPending

  const onRevoke = (sid: string, isCurrent: boolean) => {
    setConfirm({
      title: isCurrent ? t('admin.my.sessions.revokeCurrentTitle') : t('admin.my.sessions.revokeTitle'),
      description: isCurrent ? t('admin.my.sessions.revokeCurrentBody') : t('admin.my.sessions.revokeBody'),
      actionLabel: t('admin.my.sessions.revoke'),
      destructive: true,
      actionIcon: <LogOutIcon data-icon />,
      onConfirm: () => {
        if (isCurrent) {
          void logout('/admin/signin')
          return
        }
        revoke.mutate({ sid })
      },
    })
  }

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header title={t('public.chrome.mySessions')} description={t('admin.my.sessions.description')}>
          <SessionSortSelect sort={sort} options={MY_SESSION_SORT_OPTIONS} onChange={setSort} />
        </AdminListPage.Header>

        <AdminListPage.Body>
          <div className="divide-y">
            {items.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MonitorIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t('admin.my.sessions.empty')}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              items.map((item) => (
                <MySessionRow
                  key={item.sid}
                  item={item}
                  submitting={submitting}
                  onRevoke={onRevoke}
                  dateFormat={DATE_FORMAT}
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
