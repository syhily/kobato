import type { AdminImageKind } from '@kobato/shared/types/images'
import type { ActiveImageFilter, ImageFilterField } from '@kobato/ui/admin/images/useImagesReducer'

import { Popover, PopoverContent, PopoverTrigger } from '@kobato/ui/components/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kobato/ui/components/select'
import { cn } from '@kobato/ui/lib/cn'
import { FunnelIcon, FunnelPlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface ImagesFilterBarProps {
  filters: ActiveImageFilter[]
  onAddFilter: (field: ImageFilterField, value: string, label: string) => void
  onRemoveFilter: (field: ImageFilterField) => void
  onClearFilters: () => void
}

const KIND_OPTIONS: { value: AdminImageKind; label: string }[] = [
  { value: 'generic', label: '普通图片' },
  { value: 'category', label: '分类封面' },
  { value: 'friend', label: '友链海报' },
]

function isAdminImageKind(value: string): value is AdminImageKind {
  return KIND_OPTIONS.some((option) => option.value === value)
}

function SearchFilterPill({
  value,
  onChange,
  onRemove,
}: {
  value: string
  onChange: (value: string) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }

  const commit = (next: string) => {
    const trimmed = next.trim()
    if (trimmed === '') {
      onRemove()
      return
    }
    onChange(trimmed)
  }

  return (
    <div className="flex items-center">
      <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-background px-3 text-sm text-foreground">
        <SearchIcon className="size-3.5 text-muted-foreground" />
        搜索
      </div>
      <div className="flex h-9 min-w-0 items-center border border-r-0 border-border bg-background">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit(draft)
            }
          }}
          placeholder="路径 / 备注"
          className="h-full w-32 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground sm:w-48"
          autoComplete="off"
        />
      </div>
      <button
        type="button"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-r-md border border-l-0 border-border text-muted-foreground transition',
          'hover:bg-secondary hover:text-foreground',
          'focus-visible:shadow-focus focus-visible:outline-none',
        )}
        onClick={onRemove}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

function KindFilterPill({
  value,
  onChange,
  onRemove,
}: {
  value: AdminImageKind
  onChange: (value: AdminImageKind) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center">
      <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-background px-3 text-sm text-foreground">
        用途
      </div>
      <div className="flex h-9 items-center border border-r-0 border-border bg-background">
        <Select<AdminImageKind>
          value={value}
          items={KIND_OPTIONS}
          onValueChange={(v) => {
            if (v) {
              onChange(v)
            }
          }}
        >
          <SelectTrigger className="h-full border-0 px-3 shadow-none data-[popup-open]:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <button
        type="button"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-r-md border border-l-0 border-border text-muted-foreground transition',
          'hover:bg-secondary hover:text-foreground',
          'focus-visible:shadow-focus focus-visible:outline-none',
        )}
        onClick={onRemove}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

export function ImagesFilterBar({ filters, onAddFilter, onRemoveFilter, onClearFilters }: ImagesFilterBarProps) {
  const [open, setOpen] = useState(false)
  const hasFilters = filters.length > 0
  const hasSearch = filters.some((f) => f.field === 'q')
  const hasKind = filters.some((f) => f.field === 'kind')

  // Match comments filter shortcut: press "f" outside inputs to open the filter menu.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'f' || e.metaKey || e.ctrlKey || e.altKey) {
        return
      }
      const target = e.target instanceof HTMLElement ? e.target : null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      e.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {filters.map((filter) =>
        filter.field === 'q' ? (
          <SearchFilterPill
            key={filter.field}
            value={filter.value}
            onChange={(value) => onAddFilter('q', value, value)}
            onRemove={() => onRemoveFilter('q')}
          />
        ) : isAdminImageKind(filter.value) ? (
          <KindFilterPill
            key={filter.field}
            value={filter.value}
            onChange={(value) => onAddFilter('kind', value, kindLabel(value))}
            onRemove={() => onRemoveFilter('kind')}
          />
        ) : null,
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm transition hover:bg-accent',
            'focus-visible:shadow-focus focus-visible:outline-none',
          )}
        >
          {hasFilters ? <FunnelPlusIcon className="size-4" /> : <FunnelIcon className="size-4" />}
          {hasFilters ? '添加筛选' : '筛选'}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-0">
          <div className="max-h-60 overflow-y-auto p-1">
            {!hasSearch && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onAddFilter('q', '', '')
                  setOpen(false)
                }}
              >
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                搜索
              </button>
            )}
            {!hasKind && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onAddFilter('kind', 'generic', kindLabel('generic'))
                  setOpen(false)
                }}
              >
                用途
              </button>
            )}
            {hasSearch && hasKind && <p className="px-2 py-1.5 text-sm text-muted-foreground">无匹配字段</p>}
          </div>
        </PopoverContent>
      </Popover>

      {hasFilters && (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
          onClick={onClearFilters}
        >
          <XIcon className="size-3.5" />
          清除
        </button>
      )}
    </div>
  )
}

function kindLabel(kind: AdminImageKind): string {
  switch (kind) {
    case 'generic':
      return '普通图片'
    case 'category':
      return '分类封面'
    case 'friend':
      return '友链海报'
  }
}
