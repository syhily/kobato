import type { FilterOptionItem, FilterOptionRenderer } from '@kobato/ui/admin/shared/filter-bar/types'

import { Input } from '@kobato/ui/components/input'
import { cn } from '@kobato/ui/lib/cn'
import { SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

// Two list leaves shared by the add-button picker step and the pill editors:
// `SearchableOptionList` filters a STATIC option set locally (audit action /
// resourceType / actor), `InlineSearchList` renders ASYNC search results and
// forwards keystrokes to the field's debounced server search (comments page /
// author, my-comments entity).

interface SearchableOptionListProps {
  options: readonly FilterOptionItem[]
  selectedValue?: string
  onSelect: (option: FilterOptionItem) => void
  placeholder?: string
  emptyMessage?: string
  renderOption?: FilterOptionRenderer
}

export function SearchableOptionList({
  options,
  selectedValue,
  onSelect,
  placeholder = '搜索…',
  emptyMessage = '无匹配选项',
  renderOption,
}: SearchableOptionListProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) {
      return options
    }
    return options.filter((o) => o.label.toLowerCase().includes(trimmed) || o.value.toLowerCase().includes(trimmed))
  }, [options, query])

  return (
    <div className="flex flex-col">
      <div className="border-b p-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>
      <div className="max-h-60 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          filtered.map((option) => {
            const isSelected = selectedValue === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground',
                  // Custom-rendered rows (audit actor) carry the selected
                  // background on the whole row; plain rows highlight the
                  // label text instead.
                  renderOption && isSelected && 'bg-accent text-accent-foreground',
                )}
                onClick={() => onSelect(option)}
              >
                {renderOption ? (
                  renderOption(option, isSelected)
                ) : (
                  <span className={isSelected ? 'font-medium text-primary' : ''}>{option.label}</span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

interface InlineSearchListProps {
  items: FilterOptionItem[]
  onSearch: (query: string) => void
  onSelect: (value: string, label: string) => void
  placeholder: string
  emptyMessage: string
}

export function InlineSearchList({ items, onSearch, onSelect, placeholder, emptyMessage }: InlineSearchListProps) {
  const [query, setQuery] = useState('')

  const handleSearch = (value: string) => {
    setQuery(value)
    onSearch(value)
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          aria-label="搜索"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>
      <div className="p-1">
        {items.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <button
              key={item.value}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground"
              onClick={() => onSelect(item.value, item.label)}
            >
              {item.label}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
