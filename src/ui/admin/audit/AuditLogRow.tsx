import { ChevronRightIcon } from 'lucide-react'
import { useCallback, useState } from 'react'

import type { AuditLogItemDto } from '@/shared/contracts/audit'

import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { sanitizeHtml } from '@/shared/sanitize/sanitize-html'
import { formatLocalDate } from '@/shared/utils/formatter'
import { ROLE_LABEL_KEYS, ROLE_LEVELS, type Role } from '@/shared/utils/roles'
import { ACTION_OPTIONS, RESOURCE_TYPE_OPTIONS } from '@/ui/admin/audit/filter-fields'
import { Badge } from '@/ui/components/badge'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

interface AuditLogRowProps {
  row: AuditLogItemDto
}

const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm:ss'

const ACTION_LABEL_IDS = new Map(ACTION_OPTIONS.map((o) => [o.value, o.labelId]))

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

function hasAuditDetails(row: AuditLogItemDto): boolean {
  if (!row.details) {
    return false
  }
  if (Array.isArray(row.details)) {
    return row.details.length > 0
  }
  return Object.keys(row.details).length > 0
}

export function AuditLogRow({ row }: AuditLogRowProps) {
  const { t } = useI18n()
  const config = useSiteIdentity()
  const [isExpanded, setIsExpanded] = useState(false)

  const actionLabelId = ACTION_LABEL_IDS.get(row.action)
  const actionLabel = actionLabelId ? t(actionLabelId) : row.action
  const resourceLabelId = RESOURCE_TYPE_OPTIONS.find((o) => o.value === row.resourceType)?.labelId
  const resourceLabel = resourceLabelId ? t(resourceLabelId) : row.resourceType
  const canExpand = hasAuditDetails(row)

  const toggleExpanded = useCallback(() => {
    if (!canExpand) {
      return
    }
    setIsExpanded((v) => !v)
  }, [canExpand])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!canExpand) {
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggleExpanded()
      }
    },
    [canExpand, toggleExpanded],
  )

  return (
    <div
      className={cn(
        'group relative flex flex-wrap items-start gap-3 px-4 py-3 transition-colors',
        canExpand &&
          'cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:shadow-focus focus-visible:outline-none',
      )}
      onClick={toggleExpanded}
      onKeyDown={handleKeyDown}
      role={canExpand ? 'button' : undefined}
      tabIndex={canExpand ? 0 : undefined}
      aria-expanded={canExpand ? isExpanded : undefined}
      aria-label={
        canExpand ? (isExpanded ? t('admin.audit.collapse') : t('admin.audit.expand')) : t('admin.audit.noDetails')
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{actionLabel}</Badge>
          {row.actorName ? (
            <span className="text-sm font-medium">{row.actorName}</span>
          ) : row.actorId ? (
            <span className="text-xs text-muted-foreground">
              {t('admin.audit.idLabel')} {row.actorId}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {row.actorRole && isKnownRole(row.actorRole) && (
            <Badge variant="secondary" className={roleBadgeClasses(row.actorRole)}>
              {t(ROLE_LABEL_KEYS[row.actorRole])}
            </Badge>
          )}
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          {formatLocalDate(new Date(row.createdAt), ADMIN_DATE_FORMAT, config)}
          {row.ipAddressMasked && (
            <>
              {' · '}
              <span className="tabular-nums">
                {t('admin.audit.ipLabel')} {row.ipAddressMasked}
              </span>
            </>
          )}
          {' · '}
          <span>{resourceLabel}</span>
          {row.resourceId && <span className="ml-1 tabular-nums">#{row.resourceId}</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center self-center">
        <ChevronRightIcon
          className={cn(
            'size-5 transition-transform duration-200',
            canExpand ? 'text-muted-foreground group-hover:text-foreground' : 'text-muted-foreground/30',
            isExpanded && 'rotate-90',
          )}
          aria-hidden
        />
      </div>

      {canExpand && isExpanded && (
        <div className="w-full" onClick={(e) => e.stopPropagation()}>
          <JsonDetailPanel row={row} />
        </div>
      )}
    </div>
  )
}

function JsonDetailPanel({ row }: { row: AuditLogItemDto }) {
  const { t } = useI18n()
  if (!row.details) {
    return (
      <div className="mt-3 rounded-md border bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
        {t('admin.audit.noDetails')}
      </div>
    )
  }

  return (
    <div className="mt-3 max-h-64 overflow-auto rounded-md border">
      {row.detailsHtml ? (
        <div
          className="[&>pre]:m-0 [&>pre]:rounded-none [&>pre]:border-0 [&>pre]:bg-transparent [&>pre]:px-4 [&>pre]:py-3 [&>pre]:text-xs [&>pre]:leading-relaxed"
          // Every dangerouslySetInnerHTML goes through sanitizeHtml — never rely on the producer's escaping.
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(row.detailsHtml, 'shiki') }}
        />
      ) : (
        <pre className="bg-muted/30 px-4 py-3 text-xs leading-relaxed">{JSON.stringify(row.details, null, 2)}</pre>
      )}
    </div>
  )
}
