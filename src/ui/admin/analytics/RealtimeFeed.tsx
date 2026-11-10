import { useMemo } from 'react'

import type { RealtimeEvent } from '@/shared/contracts/analytics'

import { useEventStream } from '@/ui/admin/analytics/use-event-stream'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

export function RealtimeFeed({ className }: { className?: string }) {
  const { t } = useI18n()
  const { events, state } = useEventStream({ bufferSize: 50 })

  const ordered = useMemo(() => {
    // SSE delivers chronological order; the UI reads newest-first.
    // ES2022 lib has no toReversed — build the reversed copy by hand.
    const copy: RealtimeEvent[] = []
    for (let i = events.length - 1; i >= 0; i -= 1) {
      copy.push(events[i]!)
    }
    return copy
  }, [events])

  return (
    <Card className={cn('flex flex-col gap-2 shadow-none', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">{t('admin.analytics.realtime.title')}</CardTitle>
        <StatusPip state={state} />
      </CardHeader>
      <CardContent className="px-2 pb-3">
        {ordered.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            {t('admin.analytics.realtime.empty')}
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto pr-2">
            <ul className="flex flex-col gap-1">
              {ordered.map((e) => (
                <li
                  // Key on content identity, not list position — the rolling window can drop the head and shift keys.
                  key={`${e.ts}-${e.path}-${e.browser ?? ''}-${e.os ?? ''}`}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl px-2 py-1 text-xs hover:bg-accent/40"
                >
                  <span className="text-muted-foreground tabular-nums">{formatClockTime(e.ts)}</span>
                  <span className="truncate text-foreground" title={e.path}>
                    {e.path}
                  </span>
                  <span className="text-right text-muted-foreground">
                    {[e.country, e.browser, e.os].filter(Boolean).join(' · ') || '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusPip({ state }: { state: 'connecting' | 'live' | 'lost' }) {
  const { t } = useI18n()
  const config: Record<typeof state, { label: string; color: string }> = {
    connecting: { label: t('admin.analytics.realtime.status.connecting'), color: 'bg-yellow-500' },
    live: { label: t('admin.analytics.realtime.status.live'), color: 'bg-emerald-500' },
    lost: { label: t('admin.analytics.realtime.status.lost'), color: 'bg-rose-500' },
  }
  const { label, color } = config[state]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('inline-block size-2 animate-pulse rounded-full', color)} />
      {label}
    </span>
  )
}

function formatClockTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
