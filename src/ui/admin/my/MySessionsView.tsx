import { LogOutIcon, MonitorIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { useRevalidator } from 'react-router'

import type { MySessionItem } from '@/routes/admin/me/sessions'

import { orpc } from '@/client/api/client'
import { useMutation } from '@/client/api/query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { formatUserAgentLabel } from '@/shared/utils/user-agent'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card, CardContent } from '@/ui/components/card'
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
      // Self-revoke is short-circuited to the logout endpoint inside
      // `onRevoke`, so by the time this handler fires we're always
      // revoking a different device — a list re-fetch is enough.
      void revalidator.revalidate()
    },
  })
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

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
          // The /admin/signin?action=logout endpoint is the single
          // canonical path that BOTH revokes the session and clears
          // the cookie via `destroySession`. Hitting the JSON revoke
          // API here would leave the cookie behind and the next
          // request would briefly look authenticated against a
          // missing Redis blob. Hard-navigate so the logout loader
          // owns the entire transition.
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
          <Button
            type="button"
            variant="outline"
            className="border-ink-4"
            onClick={() => void revalidator.revalidate()}
            disabled={revalidator.state !== 'idle'}
          >
            <RefreshCwIcon data-icon="inline-start" /> 刷新
          </Button>
        </AdminListPage.Header>

        <AdminListPage.Body>
          <div className="flex flex-col gap-3">
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
                <SessionRow
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

interface SessionRowProps {
  item: MySessionItem
  submitting: boolean
  onRevoke: (sid: string, isCurrent: boolean) => void
  dateFormat: string
  config: ReturnType<typeof useSiteIdentity>
}

function SessionRow({ item, submitting, onRevoke, dateFormat, config }: SessionRowProps) {
  const label = formatUserAgentLabel(item.userAgent)
  return (
    <Card data-slot="my-session-row">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <MonitorIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
            {item.isCurrent && <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">当前会话</Badge>}
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="inline">IP：</dt>
              <dd className="inline break-all">{item.ip || '—'}</dd>
            </div>
            <div>
              <dt className="inline">登录时间：</dt>
              <dd className="inline">{formatLocalDate(new Date(item.loginAtIso), dateFormat, config)}</dd>
            </div>
            <div>
              <dt className="inline">最近活跃：</dt>
              <dd className="inline">{formatLocalDate(new Date(item.lastActiveAtIso), dateFormat, config)}</dd>
            </div>
            <div>
              <dt className="inline">过期时间：</dt>
              <dd className="inline">{formatLocalDate(new Date(item.expiresAtIso), dateFormat, config)}</dd>
            </div>
          </dl>
          {item.userAgent && item.userAgent !== label && (
            <div className="text-[11px] break-all text-muted-foreground/80">{item.userAgent}</div>
          )}
        </div>
        <div className="flex shrink-0 items-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => onRevoke(item.sid, item.isCurrent)}
          >
            <LogOutIcon data-icon="inline-start" /> 注销
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
