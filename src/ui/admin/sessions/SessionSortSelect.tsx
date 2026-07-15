import { ArrowDownIcon, ArrowUpIcon, CheckIcon } from 'lucide-react'
import { useState } from 'react'

import type { SessionSortDirection, SessionSortOption, SessionSortState } from '@/shared/utils/sessions-sort'

import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { cn } from '@/ui/lib/cn'

interface SessionSortSelectProps<T extends string = string> {
  sort: SessionSortState<T>
  options: SessionSortOption<T>[]
  onChange: (sort: SessionSortState<T>) => void
}

export function SessionSortSelect<T extends string>({ sort, options, onChange }: SessionSortSelectProps<T>) {
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
    <div className="inline-flex items-center overflow-hidden rounded-md border border-border">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'inline-flex h-9 items-center gap-1.5 px-3 text-sm transition hover:bg-accent',
            'focus-visible:shadow-focus focus-visible:outline-none',
          )}
        >
          <span>{current?.label ?? sort.field}</span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-0">
          <div className="border-b px-3 py-2 text-sm font-medium">排序</div>
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
                  {option.label}
                  {selected && <CheckIcon className="size-4" />}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={sort.direction === 'asc' ? '升序' : '降序'}
        className={cn(
          'flex h-9 w-9 items-center justify-center border-l border-border text-muted-foreground transition',
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
