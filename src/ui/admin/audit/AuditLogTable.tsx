import { Fragment, useEffect, useState, useSyncExternalStore } from 'react'
import { createHighlighter } from 'shiki'

import type { AuditLogItemDto } from '@/shared/contracts/audit'

import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { ACTION_OPTIONS, RESOURCE_TYPE_OPTIONS } from '@/ui/admin/audit/AuditLogToolbar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { SafeHtml } from '@/ui/components/safe-html'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'

interface AuditLogTableProps {
  rows: AuditLogItemDto[]
  isLoading: boolean
}

const ACTION_LABEL_MAP = new Map(ACTION_OPTIONS.map((o) => [o.value, o.label]))
const RESOURCE_LABEL_MAP = new Map(RESOURCE_TYPE_OPTIONS.map((o) => [o.value, o.label]))

const SHIKI_THEMES = { light: 'solarized-light', dark: 'solarized-dark' } as const

// ---------------------------------------------------------------------------
// Shiki singleton — lazy-initialised, reused across rows
// ---------------------------------------------------------------------------

let shikiPromise: Promise<void> | null = null
let shikiResolve: (() => void) | null = null
let shikiReady = false

const shikiListeners = new Set<() => void>()

function subscribeShiki(listener: () => void) {
  shikiListeners.add(listener)
  return () => shikiListeners.delete(listener)
}

function getShikiSnapshot() {
  return shikiReady
}

function notifyShikiListeners() {
  for (const listener of shikiListeners) {
    listener()
  }
}

let highlighterInstance: Awaited<ReturnType<typeof createHighlighter>> | null = null

function getHighlighter() {
  if (!shikiPromise) {
    shikiPromise = createHighlighter({
      themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
      langs: ['json'],
    }).then((h) => {
      highlighterInstance = h
      shikiReady = true
      shikiResolve?.()
      notifyShikiListeners()
    })
  }
  return shikiPromise
}

function renderJson(json: string): string {
  if (!highlighterInstance) {
    return json
  }
  return highlighterInstance.codeToHtml(json, {
    lang: 'json',
    themes: { light: SHIKI_THEMES.light, dark: SHIKI_THEMES.dark },
  })
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function AuditLogTable({ rows, isLoading }: AuditLogTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    void getHighlighter()
  }, [])

  if (isLoading && rows.length === 0) {
    return (
      <Card className="overflow-hidden p-0">
        <div className="flex h-64 items-center justify-center text-muted-foreground">加载中…</div>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card className="overflow-hidden p-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon" />
            <EmptyTitle>暂无审计日志记录</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">时间</TableHead>
            <TableHead>操作类型</TableHead>
            <TableHead>操作人</TableHead>
            <TableHead>资源</TableHead>
            <TableHead className="w-[120px]">IP</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isExpanded = expandedId === row.id
            return (
              <Fragment key={row.id}>
                <AuditLogRow
                  row={row}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedId(isExpanded ? null : row.id)}
                />
                {isExpanded && <JsonDetailRow details={row.details} />}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface AuditLogRowProps {
  row: AuditLogItemDto
  isExpanded: boolean
  onToggle: () => void
}

function AuditLogRow({ row, isExpanded, onToggle }: AuditLogRowProps) {
  const config = useSiteIdentity()

  return (
    <TableRow className={isExpanded ? 'bg-muted/30 hover:bg-muted/30' : undefined}>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {formatLocalDate(new Date(row.createdAt), undefined, config)}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{ACTION_LABEL_MAP.get(row.action) ?? row.action}</Badge>
      </TableCell>
      <TableCell>
        {row.actorName ? (
          <span className="text-sm">{row.actorName}</span>
        ) : row.actorId ? (
          <span className="text-xs text-muted-foreground">ID: {row.actorId}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {row.actorRole && <span className="ml-1 text-xs text-muted-foreground">({row.actorRole})</span>}
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {RESOURCE_LABEL_MAP.get(row.resourceType) ?? row.resourceType}
        </span>
        {row.resourceId && <span className="ml-1 text-xs tabular-nums">#{row.resourceId}</span>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{row.ipAddressMasked}</TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" onClick={onToggle} aria-label={isExpanded ? '收起详情' : '展开详情'}>
          <ChevronIcon expanded={isExpanded} />
        </Button>
      </TableCell>
    </TableRow>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s',
      }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// JSON detail row (Shiki-highlighted)
// ---------------------------------------------------------------------------

function JsonDetailRow({ details }: { details: Record<string, unknown> | null }) {
  const ready = useSyncExternalStore(subscribeShiki, getShikiSnapshot, getShikiSnapshot)

  if (!details) {
    return (
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell colSpan={6} className="py-3 text-center text-xs text-muted-foreground">
          无详情数据
        </TableCell>
      </TableRow>
    )
  }

  const json = JSON.stringify(details, null, 2)
  const html = ready ? renderJson(json) : null

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={6} className="p-0">
        <div className="max-h-64 overflow-auto border-t">
          {html ? (
            <SafeHtml
              html={html}
              strategy="audit"
              className="[&>pre]:m-0 [&>pre]:rounded-none [&>pre]:border-0 [&>pre]:bg-transparent [&>pre]:px-4 [&>pre]:py-3 [&>pre]:text-xs [&>pre]:leading-relaxed"
            />
          ) : (
            <pre className="px-4 py-3 text-xs leading-relaxed">{json}</pre>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
