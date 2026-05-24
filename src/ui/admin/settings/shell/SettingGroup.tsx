import type { ReactNode } from 'react'

import { CheckIcon, Loader2Icon, PencilIcon, XIcon } from 'lucide-react'

import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'

interface SettingGroupProps {
  title: string
  description?: string
  children?: ReactNode
  className?: string
  /** Action buttons / controls rendered in the top-right of the header.
   *  Typically an Edit button in read mode, or Save + Cancel in edit mode. */
  actions?: ReactNode
  mode?: 'read' | 'edit'
  onModeChange?: (mode: 'read' | 'edit') => void
  onSave?: () => void
  onCancel?: () => void
  saveState?: 'idle' | 'saving' | 'saved' | 'error'
}

export function SettingGroup({
  title,
  description,
  children,
  className,
  actions,
  mode,
  onModeChange,
  onSave,
  onCancel,
  saveState,
}: SettingGroupProps) {
  const showEdit = mode !== 'edit' && onModeChange && !actions
  const showActions = mode === 'edit' && (onSave || onCancel)

  return (
    <div
      className={cn(
        'relative flex flex-col gap-6 rounded-xl border transition-all',
        mode === 'edit' ? 'border-border shadow-sm' : 'hover:border-border/80 hover:shadow-sm',
        className,
      )}
    >
      <div className={cn('flex flex-col gap-6', children && 'p-5 md:p-7')}>
        <div className="flex items-start justify-between gap-4">
          {(title || description) && (
            <div>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              {description && (
                <p className={cn('mt-1 mr-5 text-sm text-muted-foreground', mode === 'edit' && 'hidden md:block')}>
                  {description}
                </p>
              )}
            </div>
          )}
          <div className="mt-[-5px] -mr-1 flex shrink-0 items-center gap-2">
            {actions}

            {showEdit ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onModeChange('edit')}>
                <PencilIcon data-icon="sm" />
                <span className="ml-1">编辑</span>
              </Button>
            ) : null}

            {showActions ? (
              <>
                {saveState === 'saving' ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2Icon data-icon className="size-3.5 animate-spin" />
                    保存中…
                  </span>
                ) : saveState === 'saved' ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckIcon data-icon className="size-3.5" />
                    已保存
                  </span>
                ) : null}

                {onCancel ? (
                  <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saveState === 'saving'}>
                    <XIcon data-icon="sm" />
                    <span className="ml-1">取消</span>
                  </Button>
                ) : null}

                {onSave ? (
                  <Button type="button" size="sm" onClick={onSave} disabled={saveState === 'saving'}>
                    {saveState === 'saving' ? '保存中…' : '保存'}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}
