import type { ReactNode } from 'react'

import { cn } from '@kobato/ui/lib/cn'
import { Loader2Icon } from 'lucide-react'

interface SettingGroupProps {
  title: string
  description?: string
  children?: ReactNode
  className?: string
  /** Action buttons / controls rendered in the top-right of the header. */
  actions?: ReactNode
  saveState?: 'idle' | 'saving' | 'saved' | 'error'
}

export function SettingGroup({ title, description, children, className, actions, saveState }: SettingGroupProps) {
  return (
    <div
      className={cn('relative flex flex-col gap-6 rounded-xl border border-border shadow-sm transition-all', className)}
    >
      <div className={cn('flex flex-col gap-6', Boolean(children) && 'p-5 md:p-7')}>
        <div className="flex items-start justify-between gap-4">
          {(title || description) && (
            <div>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              {description && <p className="mt-1 mr-5 text-sm text-muted-foreground">{description}</p>}
            </div>
          )}
          <div className="mt-[-5px] -mr-1 flex shrink-0 items-center gap-2">
            {actions}
            {saveState === 'saving' ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2Icon data-icon className="size-3.5 animate-spin" />
              </span>
            ) : null}
            {saveState === 'saved' ? <span className="text-xs text-muted-foreground">已保存</span> : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
