import { useMutation } from '@tanstack/react-query'
import { LogOutIcon, MonitorIcon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'

import type { MySessionItem } from '@/routes/admin/me/sessions'

import { orpc } from '@/client/api/client'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { DEFAULT_MY_SORT, MY_SESSION_SORT_OPTIONS } from '@/shared/utils/sessions-sort'
import { MySessionRow } from '@/ui/admin/sessions/MySessionRow'
import { SessionSortSelect } from '@/ui/admin/sessions/SessionSortSelect'
import { useSessionSort } from '@/ui/admin/sessions/useSessionSort'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'

const DATE_FORMAT = 'yyyy-LL-dd HH:mm'

export interface MySessionsViewProps {
  items: MySessionItem[]
}

export function MySessionsView({ items }: MySessionsViewProps) {
  const config = useSiteIdentity()
  const revalidator = useRevalidator()
  const revoke = useMutation({
    mutationFn: (vars: { sid: string }) => orpc.account.revokeSession({ id: vars.sid }),
    onSuccess: () => {
      void revalidator.revalidate()
    },
  })
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const { sort, setSort } = useSessionSort({
    defaultSort: DEFAULT_MY_SORT,
    sortOptions: MY_SESSION_SORT_OPTIONS,
  })

  const submitting = revoke.isPending

  const onRevoke = (sid: string, isCurrent: boolean) => {
    setConfirm({
      title: isCurrent ? '注销当前会话？' : '注销该登录会话？',
      description: isCurrent
        ? '注销后本设备将立即退出登录，并跳转到登录页。'
        : '该设备会立即退出登录，再次访问需要重新输入密码。',
      actionLabel: '注销',
      destructive: true,
      actionIcon: <LogOutIcon data-icon />,
      onConfirm: () => {
        if (isCurrent) {
          window.location.href = '/admin/signin?action=logout&redirect_to=/admin/signin'
          return
        }
        revoke.mutate({ sid })
      },
    })
  }

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header title="登录设备" description="管理本账户在各设备上的登录会话。">
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
                  <EmptyTitle>暂无登录设备</EmptyTitle>
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
