import { orpcQuery } from '@kobato/client/api/orpc-query'
import { Dialog, DialogContent, DialogTitle } from '@kobato/ui/components/dialog'
import { cn } from '@kobato/ui/lib/cn'
import { useQuery } from '@tanstack/react-query'
import { FileTextIcon, Loader2Icon, NotebookPenIcon, SearchIcon } from 'lucide-react'
import { type ComponentType, type ReactNode, memo, useEffect, useRef, useState, useTransition } from 'react'
import { useNavigate } from 'react-router'

interface AdminSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AdminSearchDialog({ open, onOpenChange }: AdminSearchDialogProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const [, startTransition] = useTransition()

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setQuery('')
      setDebouncedQuery('')
    }
  }
  useEffect(() => {
    if (!open) {
      return
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const timer = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(timer)
  }, [query, open])

  const { data: postsData, isFetching: isFetchingPosts } = useQuery(
    orpcQuery.admin.posts.list.queryOptions({
      input: { q: debouncedQuery, limit: 10 },
      enabled: debouncedQuery.trim().length > 0,
    }),
  )

  const { data: pagesData, isFetching: isFetchingPages } = useQuery(
    orpcQuery.admin.pages.list.queryOptions({
      input: { q: debouncedQuery, limit: 10 },
      enabled: debouncedQuery.trim().length > 0,
    }),
  )

  const posts = postsData?.posts ?? []
  const pages = pagesData?.pages ?? []
  const hasResults = posts.length > 0 || pages.length > 0
  const hasQuery = debouncedQuery.trim().length > 0
  const isSearching = isFetchingPosts || isFetchingPages

  function handleSelect(type: 'post' | 'page', id: string) {
    onOpenChange(false)
    startTransition(() => {
      void navigate(type === 'post' ? `/editor/post/${id}` : `/editor/page/${id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        // top-[12vh] positions the dialog 12% from the viewport top — no design-token equivalent for vh units.
        className="top-[12vh] -translate-y-0 overflow-hidden rounded-xl border-0 p-0 shadow-2xl sm:max-w-[var(--container-popup-md)]"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') {
            return
          }
          const items = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')
          if (!items.length) {
            return
          }

          const active = document.activeElement
          let idx = active instanceof HTMLButtonElement ? Array.from(items).indexOf(active) : -1

          if (event.key === 'Enter') {
            if (idx >= 0 && active !== inputRef.current) {
              event.preventDefault()
              items[idx].click()
            }
            return
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault()
            idx = idx < items.length - 1 ? idx + 1 : 0
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            idx = idx > 0 ? idx - 1 : items.length - 1
          }

          items[idx]?.focus()
        }}
      >
        <DialogTitle className="sr-only">全站搜索</DialogTitle>

        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="全站搜索…"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground focus-visible:shadow-focus"
            aria-label="搜索"
          />
          {isSearching ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <kbd className="shrink-0 rounded-xl border bg-muted px-2 py-0.5 text-badge font-medium text-muted-foreground">
              ESC
            </kbd>
          )}
        </div>

        {/* Divider */}
        {hasQuery && <div className="h-px bg-border" />}

        {/* Results */}
        <div className="max-h-empty-state overflow-y-auto overscroll-contain">
          {!hasQuery && (
            <div className="px-5 pt-2 pb-5 text-center text-sm text-muted-foreground" role="status">
              输入关键词搜索文章或页面
            </div>
          )}

          {hasQuery && !hasResults && !isSearching && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground" role="status">
              未找到「{debouncedQuery}」相关的结果
            </div>
          )}

          {hasResults && (
            <div role="listbox" aria-label="搜索结果">
              {posts.length > 0 && (
                <SearchGroup label="文章" icon={NotebookPenIcon}>
                  {posts.map((post) => (
                    <SearchResultItem
                      key={post.id}
                      title={post.title || post.slug}
                      published={post.published}
                      onClick={() => handleSelect('post', post.id)}
                    />
                  ))}
                </SearchGroup>
              )}

              {pages.length > 0 && (
                <SearchGroup label="页面" icon={FileTextIcon}>
                  {pages.map((page) => (
                    <SearchResultItem
                      key={page.id}
                      title={page.title || page.slug}
                      published={page.published}
                      onClick={() => handleSelect('page', page.id)}
                    />
                  ))}
                </SearchGroup>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SearchGroup({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <div className="pt-2" role="group" aria-label={label}>
      <div className="flex items-center gap-2 px-5 pb-1 text-xs font-semibold tracking-wide text-muted-foreground/70 uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="flex flex-col px-3 pb-2">{children}</div>
    </div>
  )
}

const SearchResultItem = memo(function SearchResultItem({
  title,
  published,
  onClick,
}: {
  title: string
  published: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left text-sm transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
      )}
      onClick={onClick}
    >
      <span className="min-w-0 truncate font-medium">{title}</span>
      {!published && (
        <span className="shrink-0 rounded-xl bg-status-warn-bg px-2 py-0.5 text-badge font-semibold text-status-warn-fg">
          草稿
        </span>
      )}
    </button>
  )
})
