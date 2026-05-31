import { SearchIcon, XIcon } from 'lucide-react'
import { useRef } from 'react'
import { useNavigate } from 'react-router'

import { useSettingsSearchFilter } from '@/ui/admin/settings/shell/useSettingsSearch'
import { Input } from '@/ui/components/input'

export function SettingsMobileBar() {
  const navigate = useNavigate()
  const { filter, setFilter } = useSettingsSearchFilter()
  const searchInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 bg-background p-8 lg:hidden">
      <div className="relative flex-1">
        <SearchIcon className="absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="搜索设置…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 w-full rounded-xl border border-transparent bg-card pr-8 pl-9 text-sm shadow-sm"
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
        ) : null}
      </div>
      <button
        type="button"
        title="关闭"
        onClick={() => {
          void navigate(-1)
        }}
        className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-hidden"
      >
        <XIcon className="size-6" aria-hidden="true" />
        <span className="sr-only">关闭</span>
      </button>
    </div>
  )
}
