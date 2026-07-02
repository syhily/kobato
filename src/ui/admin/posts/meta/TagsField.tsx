import { useQuery } from '@tanstack/react-query'
import { XIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { AdminTagDto } from '@/shared/types/tags'

import { orpc } from '@/client/api/client'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

export interface TagsFieldProps {
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
}

export function TagsField({ values, onChange, disabled }: TagsFieldProps) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)
  // Fetch the COMPLETE tag list by paginating until the server reports no
  // more pages. A single capped request (the previous `limit: 100`) silently
  // truncated the set once the blog grew past the cap, making every tag
  // outside the first page look "not created yet" in the warning below.
  const tagsQuery = useQuery({
    queryKey: ['admin', 'tags', 'list', 'all'],
    queryFn: async () => {
      const pageSize = 200
      const all: AdminTagDto[] = []
      for (let offset = 0; ; offset += pageSize) {
        const page = await orpc.admin.tags.list({ offset, limit: pageSize })
        all.push(...page.tags)
        if (!page.hasMore || page.tags.length === 0) {
          break
        }
      }
      return all
    },
  })
  const tags = tagsQuery.data ?? []

  const addTag = useCallback(
    (raw: string) => {
      const name = raw.trim()
      if (name === '' || values.includes(name)) {
        return
      }
      onChange([...values, name])
      setInput('')
      setOpen(false)
      setHighlighted(0)
      isComposingRef.current = false
      // Mobile Chinese IMEs may keep an active composition session after the
      // previous tag is added (especially when the dropdown is clicked). Reset
      // the IME state so the next tag can be typed and searched normally.
      const el = inputRef.current
      if (el && document.activeElement === el) {
        el.blur()
        el.focus()
      }
    },
    [values, onChange],
  )

  const removeTag = useCallback(
    (name: string) => {
      onChange(values.filter((v) => v !== name))
    },
    [values, onChange],
  )

  const knownTagNames = new Set(tags.map((t) => t.name))
  const unknownTags = values.filter((v) => !knownTagNames.has(v))

  const filtered = tags.filter(
    (t) => t.name.toLowerCase().includes(input.trim().toLowerCase()) && !values.includes(t.name),
  )

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) {
      return
    }
    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Node ? event.target : null
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Reset highlight when the filtered list changes.
  const [lastInput, setLastInput] = useState(input)
  if (lastInput !== input) {
    setLastInput(input)
    setHighlighted(0)
  }

  return (
    <div className="grid gap-2" ref={containerRef}>
      <Label>标签</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              disabled={disabled}
              className="rounded-full p-0.5 hover:bg-muted disabled:opacity-50"
              aria-label={`移除标签 ${tag}`}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setOpen(e.target.value.trim().length > 0)
            }}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={(e) => {
              isComposingRef.current = false
              const value = e.currentTarget.value
              setInput(value)
              setOpen(value.trim().length > 0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isComposingRef.current) {
                e.preventDefault()
                if (open && filtered.length > 0) {
                  addTag(filtered[highlighted]?.name ?? input)
                } else {
                  addTag(input)
                }
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (!open && filtered.length > 0) {
                  setOpen(true)
                }
                setHighlighted((i) => Math.min(i + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlighted((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            onFocus={() => {
              if (input.trim().length > 0 && filtered.length > 0) {
                setOpen(true)
              }
            }}
            disabled={disabled}
            placeholder="输入标签名称，按回车添加"
            className="w-full"
            autoComplete="off"
          />
          {open && filtered.length > 0 && (
            <ul className="absolute z-(--z-modal) mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-popover py-1 shadow-md">
              {filtered.map((tag, index) => (
                <button
                  key={tag.id}
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(e) => {
                    // Prevent the input from losing focus before the click
                    // is processed, which would prematurely close the list.
                    e.preventDefault()
                    addTag(tag.name)
                  }}
                  className={cn(
                    'w-full cursor-pointer px-3 py-2 text-left text-sm',
                    index === highlighted ? 'bg-accent text-accent-foreground' : 'text-popover-foreground',
                  )}
                >
                  {tag.name}
                </button>
              ))}
            </ul>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addTag(input)}
          disabled={disabled || input.trim() === ''}
        >
          添加
        </Button>
      </div>
      {unknownTags.length > 0 && (
        <p className="text-xs text-status-warn-fg">
          警告：以下标签尚未在系统中创建：{unknownTags.join('、')}
          。保存前请确认，或前往标签管理新建。
        </p>
      )}
    </div>
  )
}
