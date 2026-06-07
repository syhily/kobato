import { SearchIcon } from 'lucide-react'
import { useState } from 'react'

import type { FilterItem } from '@/ui/admin/comments/useCommentsController'

interface InlineSearchableListProps {
  items: FilterItem[]
  onSearch: (query: string) => void
  onSelect: (value: string, label: string) => void
  placeholder: string
  emptyMessage: string
}

export function InlineSearchableList({
  items,
  onSearch,
  onSelect,
  placeholder,
  emptyMessage,
}: InlineSearchableListProps) {
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
