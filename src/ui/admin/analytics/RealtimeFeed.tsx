import { useMemo } from 'react'

import { useEventStream } from '@/ui/admin/analytics/use-event-stream'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { cn } from '@/ui/lib/cn'

// Right-rail "latest 50 events" feed. Reads from the SSE stream;
// rows fade in newest-first so the live update is obvious.

export function RealtimeFeed({ className }: { className?: string }) {
  const { events, state } = useEventStream({ bufferSize: 50 })

  const ordered = useMemo(() => {
    // SSE delivers chronological order; the UI reads newest-first.
    return [...events].reverse()
  }, [events])

  return (
    <Card className={cn('flex flex-col gap-2 shadow-none', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">实时访问</CardTitle>
        <StatusPip state={state} />
      </CardHeader>
      <CardContent className="px-2 pb-3">
        {ordered.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">等待第一条访问…</div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto pr-2">
            <ul className="flex flex-col gap-1">
              {ordered.map((e, idx) => (
                <li
                  // `ts` is the access event's millisecond timestamp;
                  // two events on the same ms tie-break by their
                  // arrival index in the rolling window. Items are
                  // append-only and never reorder.
                  // oxlint-disable-next-line react/no-array-index-key
                  key={`${e.ts}-${idx}`}
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
  const config: Record<typeof state, { label: string; color: string }> = {
    connecting: { label: '连接中', color: 'bg-yellow-500' },
    live: { label: '实时', color: 'bg-emerald-500' },
    lost: { label: '已断开', color: 'bg-rose-500' },
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
