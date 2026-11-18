import type { SessionSortDirection, SessionSortOption, SessionSortState } from '@kobato/web-admin/ui/sessions/sort.ts'

import { Popover, PopoverContent, PopoverTrigger } from '@kobato/ui/components/popover.tsx'
import { cn } from '@kobato/ui/lib/cn.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon } from 'lucide-react'
import { useState } from 'react'

interface SessionSortSelectProps<T extends string = string> {
  sort: SessionSortState<T>
  options: SessionSortOption<T>[]
  onChange: (sort: SessionSortState<T>) => void
}

export function SessionSortSelect<T extends string>({ sort, options, onChange }: SessionSortSelectProps<T>) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === sort.field)

  const handleFieldChange = (field: T) => {
    const option = options.find((o) => o.value === field)
    if (!option) {
      return
    }
    onChange({ field, direction: option.defaultDirection })
    setOpen(false)
  }

  const toggleDirection = () => {
    const nextDirection: SessionSortDirection = sort.direction === 'asc' ? 'desc' : 'asc'
    onChange({ field: sort.field, direction: nextDirection })
  }

  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border border-line-muted">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'inline-flex h-9 items-center gap-1.5 px-3 text-sm transition hover:bg-accent',
            'focus-visible:shadow-focus focus-visible:outline-none',
          )}
        >
          <span>{current === undefined ? sort.field : t(current.labelId)}</span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-0">
          <div className="border-b px-3 py-2 text-sm font-medium">{t('admin.sessions.sort')}</div>
          <div className="p-1">
            {options.map((option) => {
              const selected = sort.field === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition',
                    selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground',
                  )}
                  onClick={() => handleFieldChange(option.value)}
                >
                  {t(option.labelId)}
                  {selected && <CheckIcon className="size-4" />}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={sort.direction === 'asc' ? t('admin.sessions.sortAsc') : t('admin.sessions.sortDesc')}
        className={cn(
          'flex h-9 w-9 items-center justify-center border-l border-line-muted text-muted-foreground transition',
          'hover:bg-accent hover:text-foreground',
          'focus-visible:shadow-focus focus-visible:outline-none',
        )}
        onClick={toggleDirection}
      >
        {sort.direction === 'asc' ? <ArrowUpIcon className="size-4" /> : <ArrowDownIcon className="size-4" />}
      </button>
    </div>
  )
}
