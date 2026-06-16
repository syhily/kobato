import { SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Input } from '@/ui/components/input'

interface SearchableOptionListProps<T extends { value: string; label: string }> {
  options: T[]
  selectedValue?: string
  onSelect: (option: T) => void
  placeholder?: string
}

export function SearchableOptionList<T extends { value: string; label: string }>({
  options,
  selectedValue,
  onSelect,
  placeholder = '搜索…',
}: SearchableOptionListProps<T>) {
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
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">无匹配选项</p>
        ) : (
          filtered.map((option) => {
            const isSelected = selectedValue === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground'
                }
                onClick={() => onSelect(option)}
              >
                <span className={isSelected ? 'font-medium text-primary' : ''}>{option.label}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
