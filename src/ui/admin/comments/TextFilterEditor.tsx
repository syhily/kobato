import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  TEXT_FILTER_OPERATORS,
  type TextFilterOperator,
  type TextFilterValue,
} from '@/ui/admin/comments/useCommentsController'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/components/dropdown-menu'
import { cn } from '@/ui/lib/cn'

function TextOperatorTrigger({
  value,
  onChange,
  className,
}: {
  value: TextFilterOperator
  onChange: (op: TextFilterOperator) => void
  className?: string
}) {
  const currentLabel = TEXT_FILTER_OPERATORS.find((o) => o.value === value)?.label ?? value
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex h-9 w-full cursor-pointer items-center justify-between gap-1 px-3 text-sm transition',
          'hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
          className,
        )}
      >
        {currentLabel}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-32">
        {TEXT_FILTER_OPERATORS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className="flex items-center justify-between"
          >
            <span>{option.label}</span>
            {option.value === value && <CheckIcon className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface TextFilterEditorProps {
  value: TextFilterValue
  onChange: (next: TextFilterValue) => void
}

export function TextFilterEditor({ value, onChange }: TextFilterEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localValue, setLocalValue] = useState(value.value)
  const lastLocalCommitRef = useRef(value.value)

  useEffect(() => {
    if (value.value === lastLocalCommitRef.current) {
      return
    }
    if (document.activeElement !== inputRef.current) {
      setLocalValue(value.value)
      lastLocalCommitRef.current = value.value
    }
  }, [value.value])

  const commit = (next: string) => {
    lastLocalCommitRef.current = next
    onChange({ op: value.op, value: next })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit(localValue.trim())
    }
  }

  const handleBlur = () => {
    commit(localValue.trim())
  }

  const handleOperatorChange = (nextOp: TextFilterOperator) => {
    onChange({ op: nextOp, value: value.value })
  }

  return (
    <div className="flex h-full w-full items-stretch">
      <TextOperatorTrigger value={value.op} onChange={handleOperatorChange} className="border-r border-border" />
      <div className="flex flex-1 items-stretch">
        <input
          ref={inputRef}
          aria-label="搜索评论内容"
          autoComplete="off"
          placeholder="搜索评论内容…"
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}
