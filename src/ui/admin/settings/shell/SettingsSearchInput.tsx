import { SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { useSettingsSearchFilter } from '@/ui/admin/settings/shell/useSettingsSearch'
import { SearchShortcutHint } from '@/ui/admin/shared/SearchShortcutHint'
import { Input } from '@/ui/components/input'

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.nodeName === 'INPUT' || target.nodeName === 'TEXTAREA' || target.isContentEditable)
  )
}

export function SettingsSearchInput() {
  const { filter, setFilter } = useSettingsSearchFilter()
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key === 'k'
      if (!isSearchShortcut) {
        return
      }
      if (isTypingTarget(event.target)) {
        return
      }
      event.preventDefault()
      searchInputRef.current?.focus()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div className="sticky top-0 z-10 pt-10 pb-4">
      <div className="relative w-full">
        <SearchIcon className="absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="搜索设置…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 w-full rounded-lg border border-transparent bg-card pr-8 pl-9 text-sm shadow-sm transition-[color,background-color,border-color,box-shadow] hover:shadow focus-visible:border-brand focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-brand/25"
          autoComplete="off"
          autoCorrect="off"
        />
        {filter ? (
          <button
            type="button"
            onClick={() => {
              setFilter('')
              searchInputRef.current?.focus()
            }}
            className="absolute top-1/2 right-2.5 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <span className="sr-only">清除搜索</span>
            <XIcon className="size-3.5" />
          </button>
        ) : (
          <div className="absolute top-1/2 right-2.5 z-10 hidden -translate-y-1/2 select-none lg:flex">
            <SearchShortcutHint />
          </div>
        )}
      </div>
    </div>
  )
}
