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
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'

import { orpcQuery } from '@/client/api/orpc-query'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { AlbumCard } from '@/ui/admin/musics/AlbumCard'
import { MusicLibraryHero } from '@/ui/admin/musics/MusicLibraryHero'
import { useMusicPlayerActions } from '@/ui/admin/musics/MusicPlayerContext'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/components/dropdown-menu'
import { cn } from '@/ui/lib/cn'

export type MusicSortBy = 'createdAt' | 'updatedAt' | 'name' | 'artist' | 'album'
export type MusicSortOrder = 'asc' | 'desc'

const PAGE_SIZE = 24

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

export function SortIcon({ sortBy, sortOrder }: { sortBy: MusicSortBy; sortOrder: MusicSortOrder }) {
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
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<MusicSortBy>('createdAt')
  const [sortOrder, setSortOrder] = useState<MusicSortOrder>('desc')
  const { load } = useMusicPlayerActions()

  const [qInput, setQInput] = useState('')

  const {
    rows: allMusics,
    total,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  } = useAdminInfiniteList({
    namespace: orpcQuery.admin.music.list,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({
      q: q || undefined,
      offset,
      limit: PAGE_SIZE,
      sortBy,
      sortOrder,
    }),
    selectRows: (page) => page.musics,
    noun: '音乐',
  })

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
    (next: MusicSortBy) => {
      if (sortBy === next) {
        setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortBy(next)
        setSortOrder('asc')
      }
    },
    [sortBy],
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
          <div className="flex shrink-0 items-center overflow-hidden rounded-full bg-surface-dim">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-ink-1 transition-colors hover:bg-surface sm:px-4"
                aria-label="排序"
              >
                <SortIcon sortBy={sortBy} sortOrder={sortOrder} />
                <span className="hidden sm:inline">{SORT_LABELS[sortBy]}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-40">
                {sortLabelEntries().map(([key, label]) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => handleSortChange(key)}
                    className={cn(sortBy === key ? 'text-ink-1' : 'text-ink-3')}
                  >
                    <span>{label}</span>
                    {sortBy === key && (
                      <span className="ml-auto text-ink-4">{sortOrder === 'asc' ? '升序' : '降序'}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="h-5 w-px bg-line-muted" />
            <button
              type="button"
              onClick={() => setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'))}
              className="px-3 py-2.5 text-sm text-ink-4 transition-colors hover:bg-surface hover:text-ink-1 sm:px-4"
            >
              {sortOrder === 'asc' ? '升序' : '降序'}
            </button>
          </div>

          <form
            className="relative min-w-0 flex-1 sm:ml-auto sm:flex-none"
            onSubmit={(e) => {
              e.preventDefault()
              setQ(qInput)
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
                加载中…
              </div>
            )}
            {!hasNextPage && allMusics.length > 0 && <p className="text-sm text-ink-4">已加载全部 {total} 首歌曲</p>}
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
