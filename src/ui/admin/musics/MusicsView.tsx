import { useInfiniteQuery } from '@tanstack/react-query'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  ClockArrowDown,
  ClockArrowUp,
  Play,
  Plus,
  Search,
} from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { orpc } from '@/client/api/client'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { AlbumCard } from '@/ui/admin/musics/AlbumCard'
import { MusicLibraryHero } from '@/ui/admin/musics/MusicLibraryHero'
import { useMusicPlayerActions } from '@/ui/admin/musics/MusicPlayerContext'
import { type MusicSortBy, useMusicsController } from '@/ui/admin/musics/useMusicsController'
import { cn } from '@/ui/lib/cn'

const SORT_LABELS: Record<MusicSortBy, string> = {
  createdAt: '创建时间',
  updatedAt: '更新时间',
  name: '歌曲名称',
  artist: '艺人',
  album: '专辑',
}

function sortLabelEntries(): [MusicSortBy, string][] {
  return unsafeCast<[MusicSortBy, string][]>(Object.entries(SORT_LABELS))
}

function SortIcon({ sortBy, sortOrder }: { sortBy: MusicSortBy; sortOrder: 'asc' | 'desc' }) {
  const asc = sortOrder === 'asc'
  switch (sortBy) {
    case 'createdAt':
      return asc ? <ClockArrowUp className="size-4" /> : <ClockArrowDown className="size-4" />
    case 'updatedAt':
      return asc ? <CalendarArrowUp className="size-4" /> : <CalendarArrowDown className="size-4" />
    case 'name':
    case 'artist':
    case 'album':
      return asc ? <ArrowUpAZ className="size-4" /> : <ArrowDownAZ className="size-4" />
  }
}

export function MusicsView() {
  const navigate = useNavigate()
  const { state, dispatch } = useMusicsController()
  const { load } = useMusicPlayerActions()
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuId = useId()
  const sortTriggerRef = useRef<HTMLButtonElement>(null)
  const sortItemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Close sort menu on click outside
  useEffect(() => {
    if (!sortMenuOpen) {
      return
    }
    const handler = (e: MouseEvent) => {
      const target = e.target instanceof Node ? e.target : null
      const menu = sortTriggerRef.current?.closest('[data-sort-menu]')
      if (target && menu && !menu.contains(target)) {
        setSortMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [sortMenuOpen])

  const focusSortItem = useCallback((index: number) => {
    const item = sortItemRefs.current[index]
    if (item) {
      item.focus()
    }
  }, [])

  const handleSortTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setSortMenuOpen(true)
        requestAnimationFrame(() => {
          const idx = e.key === 'ArrowDown' ? 0 : sortItemRefs.current.length - 1
          focusSortItem(idx)
        })
      }
    },
    [focusSortItem],
  )

  const handleSortItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        focusSortItem(Math.min(index + 1, sortItemRefs.current.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        focusSortItem(Math.max(index - 1, 0))
      } else if (e.key === 'Home') {
        e.preventDefault()
        focusSortItem(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        focusSortItem(sortItemRefs.current.length - 1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setSortMenuOpen(false)
        sortTriggerRef.current?.focus()
      }
    },
    [focusSortItem],
  )

  const [qInput, setQInput] = useState('')

  const queryKey = useMemo(
    () => ['admin', 'music', 'list', { q: state.q, sortBy: state.sortBy, sortOrder: state.sortOrder }],
    [state.q, state.sortBy, state.sortOrder],
  )

  const listQuery = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      return orpc.admin.music.list({
        q: state.q || undefined,
        offset: pageParam,
        limit: state.pageSize,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      })
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasMore) {
        return undefined
      }
      return (lastPageParam ?? 0) + state.pageSize
    },
    initialPageParam: 0,
  })

  // Intersection observer for infinite scroll
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage || isFetchingNextPage) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const allMusics = useMemo(() => {
    return listQuery.data?.pages.flatMap((page) => page.musics) ?? []
  }, [listQuery.data])

  const total = listQuery.data?.pages[0]?.total ?? 0
  const isLoading = listQuery.isLoading

  const handlePlayAll = useCallback(() => {
    if (allMusics.length > 0) {
      load(allMusics[0], allMusics)
    }
  }, [allMusics, load])

  const handleNavigateToDetail = useCallback(
    (id: string) => {
      const doNavigate = () => {
        void navigate(`/admin/library/music/${id}`)
      }

      if ('startViewTransition' in document) {
        void (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(doNavigate)
      } else {
        doNavigate()
      }
    },
    [navigate],
  )

  const handleSortChange = useCallback(
    (sortBy: MusicSortBy) => {
      if (state.sortBy === sortBy) {
        dispatch({ type: 'toggleSortOrder' })
      } else {
        dispatch({ type: 'setSortBy', value: sortBy })
        dispatch({ type: 'setSortOrder', value: 'asc' })
      }
      setSortMenuOpen(false)
    },
    [state.sortBy, dispatch],
  )

  return (
    <div className="min-h-full">
      {/* Hero */}
      <MusicLibraryHero musics={allMusics} total={total}>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={handlePlayAll}
            disabled={allMusics.length === 0}
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:opacity-40"
            aria-label="播放全部"
          >
            <Play className="size-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => {
              void navigate('/admin/library/music/add')
            }}
            className="flex shrink-0 items-center gap-2 rounded-full bg-surface-dim px-3 py-2.5 text-sm font-medium text-ink-1 transition-colors hover:bg-surface sm:px-5"
            aria-label="添加音乐"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">添加音乐</span>
          </button>

          {/* Sort */}
          <div className="relative shrink-0" data-sort-menu>
            <div className="flex items-center overflow-hidden rounded-full bg-surface-dim">
              <button
                ref={sortTriggerRef}
                type="button"
                onClick={() => setSortMenuOpen((v) => !v)}
                onKeyDown={handleSortTriggerKeyDown}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-ink-1 transition-colors hover:bg-surface sm:px-4"
                aria-label="排序"
                aria-haspopup="menu"
                aria-expanded={sortMenuOpen}
                aria-controls={sortMenuId}
              >
                <SortIcon sortBy={state.sortBy} sortOrder={state.sortOrder} />
                <span className="hidden sm:inline">{SORT_LABELS[state.sortBy]}</span>
              </button>
              <div className="h-5 w-px bg-line-muted" />
              <button
                type="button"
                onClick={() => dispatch({ type: 'toggleSortOrder' })}
                className="px-3 py-2.5 text-sm text-ink-4 transition-colors hover:bg-surface hover:text-ink-1 sm:px-4"
              >
                {state.sortOrder === 'asc' ? '升序' : '降序'}
              </button>
            </div>

            {sortMenuOpen && (
              <div
                id={sortMenuId}
                role="menu"
                className="absolute top-full left-0 z-50 mt-1 w-40 overflow-hidden rounded-lg bg-popover py-1 shadow-xl ring-1 ring-line-muted"
              >
                {sortLabelEntries().map(([key, label], index) => (
                  <button
                    key={key}
                    ref={(el) => {
                      sortItemRefs.current[index] = el
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => handleSortChange(key)}
                    onKeyDown={(e) => handleSortItemKeyDown(e, index)}
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors',
                      state.sortBy === key ? 'text-ink-1' : 'text-ink-3 hover:bg-surface hover:text-ink-1',
                    )}
                  >
                    <span>{label}</span>
                    {state.sortBy === key && (
                      <span className="text-ink-4">{state.sortOrder === 'asc' ? '升序' : '降序'}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            className="relative min-w-0 flex-1 sm:ml-auto sm:flex-none"
            onSubmit={(e) => {
              e.preventDefault()
              dispatch({ type: 'setQ', value: qInput })
            }}
          >
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4" />
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="搜索..."
              aria-label="搜索歌曲"
              className="h-10 w-full rounded-full bg-surface-dim py-2 pr-4 pl-10 text-sm text-ink-1 transition-colors outline-none placeholder:text-ink-4 focus:bg-surface sm:w-64"
            />
          </form>
        </div>
      </MusicLibraryHero>

      {/* Grid */}
      {isLoading ? (
        <GridSkeleton />
      ) : allMusics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-ink-4">
          <p className="text-lg font-medium">还没有音乐</p>
          <p className="mt-1 text-sm">点击上方按钮添加你的第一首歌</p>
          <button
            type="button"
            onClick={() => {
              void navigate('/admin/library/music/add')
            }}
            className="mt-6 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-105"
          >
            <Plus className="size-4" />
            添加音乐
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {allMusics.map((row) => (
              <div key={row.id} onClick={() => handleNavigateToDetail(row.id)} className="cursor-pointer">
                <AlbumCard music={row} viewTransitionName={`music-cover-${row.id}`} />
              </div>
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="mt-8 flex items-center justify-center">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-sm text-ink-4">
                <div className="size-4 animate-spin rounded-full border-2 border-line-muted border-t-primary" />
                加载中...
              </div>
            )}
            {!listQuery.hasNextPage && allMusics.length > 0 && (
              <p className="text-sm text-ink-4">已加载全部 {total} 首歌曲</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }, (_, idx) => `skel-${idx + 1}`).map((key) => (
        <div key={key} className="animate-pulse">
          <div className="aspect-square rounded-lg bg-surface-dim" />
          <div className="mt-3 h-4 w-3/4 rounded bg-surface-dim" />
          <div className="mt-1.5 h-3 w-1/2 rounded bg-surface-dim" />
        </div>
      ))}
    </div>
  )
}
