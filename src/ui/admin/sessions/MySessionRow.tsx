import { LogOutIcon, MonitorIcon } from 'lucide-react'

import type { MySessionItem } from '@/routes/admin/me/sessions'

import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
import { maskIp } from '@/ui/lib/mask'

interface MySessionRowProps {
  item: MySessionItem
  submitting: boolean
  onRevoke: (sid: string, isCurrent: boolean) => void
  dateFormat: string
  config: ReturnType<typeof useSiteIdentity>
}

export function MySessionRow({ item, submitting, onRevoke, dateFormat, config }: MySessionRowProps) {
  const { t } = useI18n()
  const label = item.label

  return (
    <div
      data-slot="my-session-row"
      className={cn('group relative flex flex-wrap items-start gap-3 px-4 py-3 transition-colors', 'hover:bg-muted/50')}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <MonitorIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
          {item.isCurrent && (
            <Badge className="bg-status-success-bg text-status-success-fg hover:bg-status-success-bg">
              {t('admin.sessions.current')}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="break-all text-muted-foreground">{maskIp(item.ip) || '—'}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('admin.sessions.login')} {formatLocalDate(new Date(item.loginAtIso), dateFormat, config)}
          <span className="mx-1.5 text-muted-foreground/60">·</span>
          {t('admin.sessions.active')} {formatLocalDate(new Date(item.lastActiveAtIso), dateFormat, config)}
          <span className="mx-1.5 text-muted-foreground/60">·</span>
          {t('admin.sessions.expires')} {formatLocalDate(new Date(item.expiresAtIso), dateFormat, config)}
        </p>
      </div>
      <div className="flex shrink-0 items-center self-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={submitting}
          onClick={() => onRevoke(item.sid, item.isCurrent)}
        >
          <LogOutIcon data-icon="inline-start" /> {t('admin.sessions.revoke')}
        </Button>
      </div>
    </div>
  )
}
