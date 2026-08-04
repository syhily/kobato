import type { AdminSessionItem } from '@kobato/shared/types/sessions'

import { orpcQuery } from '@kobato/client/api/orpc-query'
import { useSiteIdentity } from '@kobato/shared/lib/blog-config-context'
import { DEFAULT_ADMIN_SORT, SESSION_SORT_OPTIONS } from '@kobato/shared/utils/sessions-sort'
import { formatUserAgentLabel } from '@kobato/shared/utils/user-agent'
import { AdminSessionRow } from '@kobato/ui/admin/sessions/AdminSessionRow'
import { SessionSortSelect } from '@kobato/ui/admin/sessions/SessionSortSelect'
import { useSessionSort } from '@kobato/ui/admin/sessions/useSessionSort'
import { AdminListPage } from '@kobato/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@kobato/ui/admin/shared/ConfirmDialog'
import { Badge } from '@kobato/ui/components/badge'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@kobato/ui/components/empty'
import { useMutation } from '@tanstack/react-query'
import { LogOutIcon, MonitorIcon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'

export interface SessionsViewProps {
  items: AdminSessionItem[]
}

export function SessionsView({ items }: SessionsViewProps) {
  const config = useSiteIdentity()
  const revalidator = useRevalidator()
  const revoke = useMutation({
    ...orpcQuery.admin.users.revokeSession.mutationOptions(),
    onSuccess: () => {
      void revalidator.revalidate()
    },
  })
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const { sort, setSort } = useSessionSort({
    defaultSort: DEFAULT_ADMIN_SORT,
    sortOptions: SESSION_SORT_OPTIONS,
  })

  const submitting = revoke.isPending

  const onRevoke = (item: AdminSessionItem) => {
    setConfirm({
      title: item.isCurrent ? '注销你当前的会话？' : `注销 ${item.userName} 的此会话？`,
      description: item.isCurrent
        ? '这是你正在使用的会话。注销后页面会跳转到登录页，需要重新输入密码。'
        : `该设备 (${formatUserAgentLabel(item.userAgent)}) 将立即退出登录。`,
      actionLabel: '注销',
      destructive: true,
      actionIcon: <LogOutIcon data-icon />,
      onConfirm: () => {
        if (item.isCurrent) {
          window.location.href = '/admin/signin?action=logout&redirect_to=/admin/signin'
          return
        }
        revoke.mutate({ sessionId: item.sid })
      },
    })
  }

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header title="会话管理" description="查看与管理站点全部活跃登录会话。">
          <SessionSortSelect sort={sort} options={SESSION_SORT_OPTIONS} onChange={setSort} />
        </AdminListPage.Header>

        <AdminListPage.Body>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            共 <Badge variant="secondary">{items.length}</Badge> 条活跃会话
          </div>
          <div className="mt-3 divide-y">
            {items.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MonitorIcon />
                  </EmptyMedia>
                  <EmptyTitle>没有匹配的会话</EmptyTitle>
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
