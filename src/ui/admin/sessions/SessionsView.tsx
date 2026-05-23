import { LogOutIcon, MonitorIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useRevalidator, useSearchParams } from 'react-router'

import type { AdminSessionItem } from '@/routes/admin/security/sessions'

import { useMutation, orpcQuery } from '@/client/api/query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { roleLabel } from '@/shared/utils/roles'
import { formatUserAgentLabel } from '@/shared/utils/user-agent'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { DateRangePicker } from '@/ui/admin/shared/DateRangePicker'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card, CardContent } from '@/ui/components/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/components/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { maskIp } from '@/ui/lib/mask'

const DATE_FORMAT = 'yyyy-LL-dd HH:mm'

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'lastActive', label: '最近活跃' },
  { value: 'loginTime', label: '登录时间' },
  { value: 'userName', label: '用户名' },
]

interface Filters {
  q: string
  from: string
  to: string
  sort: string
}

export interface SessionsViewProps {
  items: AdminSessionItem[]
  filters: Filters
}

export function SessionsView({ items, filters }: SessionsViewProps) {
  const config = useSiteIdentity()
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const [searchParams] = useSearchParams()
  const revoke = useMutation({
    ...orpcQuery.admin.users.revokeSession.mutationOptions(),
    onSuccess: () => {
      // Self-revoke is short-circuited to the logout endpoint inside
      // `onRevoke`, so by the time this handler fires we know it was
      // a different device — a list re-fetch is enough.
      void revalidator.revalidate()
    },
  })
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') {
          next.delete(key)
        } else {
          next.set(key, value)
        }
      }
      void navigate({ search: next.toString() ? `?${next.toString()}` : '' }, { replace: false })
    },
    [navigate, searchParams],
  )

  const [searchInput, setSearchInput] = useDebouncedSearch({
    initial: filters.q,
    delayMs: 250,
    onChange: (value) => {
      if (value === filters.q) {
        return
      }
      updateParams({ q: value || null })
    },
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
          // Same reasoning as in `MySessionsView`: the canonical
          // logout endpoint is the only path that BOTH revokes the
          // session AND clears the cookie via `destroySession`. The
          // JSON revoke API only does the former, which leaves the
          // browser holding a stale cookie pointing at a missing
          // Redis blob.
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

        <AdminListPage.Toolbar>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <AdminListPage.FilterField label="搜索（用户名 / 邮箱）">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="按用户名或邮箱过滤…"
                  />
                </InputGroup>
              </AdminListPage.FilterField>
            </div>
            <AdminListPage.FilterField label="登录时间范围">
              <DateRangePicker
                from={filters.from}
                to={filters.to}
                onChange={(from, to) => updateParams({ from: from || null, to: to || null })}
              />
            </AdminListPage.FilterField>
            <AdminListPage.FilterField label="排序">
              <Select
                items={SORT_OPTIONS}
                value={filters.sort}
                onValueChange={(value) => updateParams({ sort: value && value !== 'lastActive' ? value : null })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminListPage.FilterField>
          </div>
        </AdminListPage.Toolbar>

        <AdminListPage.Body>
          <div className="text-xs text-muted-foreground">共 {items.length} 条活跃会话</div>
          <div className="mt-3 flex flex-col gap-3">
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

interface RowProps {
  item: AdminSessionItem
  submitting: boolean
  onRevoke: (item: AdminSessionItem) => void
  config: ReturnType<typeof useSiteIdentity>
}

function AdminSessionRow({ item, submitting, onRevoke, config }: RowProps) {
  const label = formatUserAgentLabel(item.userAgent)
  const initial = (item.userName || item.userEmail || '?').slice(0, 1).toUpperCase()
  return (
    <Card data-slot="admin-session-row">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarImage src={`/images/avatar/${item.userId}.png`} alt={item.userName} />
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/admin/users/${item.userId}`} className="text-sm font-medium hover:underline">
                {item.userName}
              </Link>
              <span className="text-xs text-muted-foreground">{item.userEmail}</span>
              {!!item.userRole && <Badge variant="secondary">{roleLabel(item.userRole)}</Badge>}
              {item.isCurrent && <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">当前会话</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <MonitorIcon className="size-3.5 text-muted-foreground" />
              <span>{label}</span>
              <span className="text-muted-foreground">·</span>
              <span className="break-all">{maskIp(item.ip) || '—'}</span>
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-3">
              <div>
                <dt className="inline">登录：</dt>
                <dd className="inline">{formatLocalDate(new Date(item.loginAtIso), DATE_FORMAT, config)}</dd>
              </div>
              <div>
                <dt className="inline">活跃：</dt>
                <dd className="inline">{formatLocalDate(new Date(item.lastActiveAtIso), DATE_FORMAT, config)}</dd>
              </div>
              <div>
                <dt className="inline">过期：</dt>
                <dd className="inline">{formatLocalDate(new Date(item.expiresAtIso), DATE_FORMAT, config)}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="flex shrink-0 items-start">
          <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => onRevoke(item)}>
            <LogOutIcon data-icon="inline-start" /> 注销
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
