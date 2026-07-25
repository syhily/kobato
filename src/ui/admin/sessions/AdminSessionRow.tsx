import { LogOutIcon, MonitorIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { AdminSessionItem } from '@/routes/admin/security/sessions'

import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { formatLocalDate } from '@/shared/utils/formatter'
import { ROLE_LEVELS, roleLabel, type Role } from '@/shared/utils/roles'
import { formatUserAgentLabel } from '@/shared/utils/user-agent'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'
import { maskIp } from '@/ui/lib/mask'

const DATE_FORMAT = 'yyyy-LL-dd HH:mm'

interface AdminSessionRowProps {
  item: AdminSessionItem
  submitting: boolean
  onRevoke: (item: AdminSessionItem) => void
  config: ReturnType<typeof useSiteIdentity>
}

function isKnownRole(value: string): value is Role {
  return value in ROLE_LEVELS
}

function roleBadgeClasses(role: Role): string {
  switch (role) {
    case 'admin':
      return 'border-transparent bg-(--status-error-bg) text-(--status-error-fg) hover:bg-(--status-error-bg)'
    case 'author':
      return 'border-transparent bg-(--status-info-bg) text-(--status-info-fg) hover:bg-(--status-info-bg)'
    case 'visitor':
      return 'border-transparent bg-(--status-success-bg) text-(--status-success-fg) hover:bg-(--status-success-bg)'
  }
}

export function AdminSessionRow({ item, submitting, onRevoke, config }: AdminSessionRowProps) {
  const label = formatUserAgentLabel(item.userAgent, item.platformHint)
  const initial = (item.userName || item.userEmail || '?').slice(0, 1).toUpperCase()

  return (
    <div
      data-slot="admin-session-row"
      className={cn('group relative flex flex-wrap items-start gap-3 px-4 py-3 transition-colors', 'hover:bg-muted/50')}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarImage src={avatarImageUrl(item.userId)} alt={item.userName} />
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/admin/security/users/${item.userId}`} className="text-sm font-medium hover:underline">
              {item.userName}
            </Link>
            <span className="text-xs text-muted-foreground">{item.userEmail}</span>
            {!!item.userRole && isKnownRole(item.userRole) && (
              <Badge variant="secondary" className={roleBadgeClasses(item.userRole)}>
                {roleLabel(item.userRole)}
              </Badge>
            )}
            {item.isCurrent && (
              <Badge className="bg-status-success-bg text-status-success-fg hover:bg-status-success-bg">当前会话</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <MonitorIcon className="size-3.5 text-muted-foreground" />
            <span>{label}</span>
            <span className="text-muted-foreground">·</span>
            <span className="break-all">{maskIp(item.ip) || '—'}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            登录 {formatLocalDate(new Date(item.loginAtIso), DATE_FORMAT, config)}
            <span className="mx-1.5 text-muted-foreground/60">·</span>
            活跃 {formatLocalDate(new Date(item.lastActiveAtIso), DATE_FORMAT, config)}
            <span className="mx-1.5 text-muted-foreground/60">·</span>
            过期 {formatLocalDate(new Date(item.expiresAtIso), DATE_FORMAT, config)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center self-center">
        <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => onRevoke(item)}>
          <LogOutIcon data-icon="inline-start" /> 注销
        </Button>
      </div>
    </div>
  )
}
