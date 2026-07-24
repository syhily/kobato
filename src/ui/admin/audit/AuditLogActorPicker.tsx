import { SearchIcon, UserIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { AuditLogActorDto } from '@/shared/contracts/audit'

import { Input } from '@/ui/components/input'
import { cn } from '@/ui/lib/cn'

interface AuditLogActorPickerProps {
  actors: AuditLogActorDto[]
  onSelect: (actor: AuditLogActorDto) => void
  selectedId?: string
}

export function AuditLogActorPicker({ actors, onSelect, selectedId }: AuditLogActorPickerProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) {
      return actors
    }
    return actors.filter((a) => {
      const text = `${a.email ?? ''} ${a.actorName ?? ''} ${a.actorId}`.toLowerCase()
      return text.includes(trimmed)
    })
  }, [actors, query])

  return (
    <div className="flex flex-col">
      <div className="border-b p-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索邮箱、姓名或 ID"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>
      <div className="max-h-60 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">无匹配操作人</p>
        ) : (
          filtered.map((actor) => {
            const label = actor.email || actor.actorName || actor.actorId
            const isSelected = selectedId === actor.actorId
            return (
              <button
                key={actor.actorId}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition',
                  'hover:bg-accent hover:text-accent-foreground',
                  isSelected && 'bg-accent text-accent-foreground',
                )}
                onClick={() => onSelect(actor)}
              >
                <UserIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
