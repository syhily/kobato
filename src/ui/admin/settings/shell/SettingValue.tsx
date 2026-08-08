import type { ReactNode } from 'react'

import { cn } from '@/ui/lib/cn'

interface SettingValueProps {
  /** Field label rendered in the left column. */
  label: string
  /** The read-only value — plain text, ReactNode, or a placeholder. */
  value: ReactNode
  /** Optional helper text rendered beneath the value. */
  hint?: ReactNode
  /** Value display format. `'code'` renders in a muted monospace box (for secrets, URLs, etc.). */
  format?: 'plain' | 'code'
  className?: string
}

export function SettingValue({ label, value, hint, format = 'plain', className }: SettingValueProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 sm:grid sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-start sm:gap-4',
        className,
      )}
    >
      <span className="pt-0.5 text-sm font-medium text-foreground sm:pt-1">{label}</span>
      <div className="flex flex-col gap-1">
        {format === 'code' ? (
          <div className="rounded-xl border bg-muted/40 px-3 py-2 font-mono text-sm break-all text-foreground">
            {value || <span className="text-muted-foreground">—</span>}
          </div>
        ) : (
          <span className="text-sm break-all text-foreground">
            {value || <span className="text-muted-foreground">—</span>}
          </span>
        )}
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  )
}
