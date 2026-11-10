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
import { Fragment, useCallback, useState } from 'react'
import { useNavigate } from 'react-router'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { AlbumCard } from '@/ui/admin/musics/AlbumCard'
import { MusicLibraryHero } from '@/ui/admin/musics/MusicLibraryHero'
import { useMusicPlayerActions } from '@/ui/admin/musics/MusicPlayerContext'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/components/dropdown-menu'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

export type MusicSortBy = 'createdAt' | 'updatedAt' | 'name' | 'artist' | 'album'
export type MusicSortOrder = 'asc' | 'desc'

const PAGE_SIZE = 24

const SORT_LABEL_IDS: Record<MusicSortBy, UiMessageId> = {
  createdAt: 'admin.musics.sort.createdAt',
  updatedAt: 'admin.musics.sort.updatedAt',
  name: 'admin.musics.sort.name',
  artist: 'admin.musics.sort.artist',
  album: 'admin.musics.sort.album',
}

function sortLabelEntries(): [MusicSortBy, UiMessageId][] {
  return unsafeCast<[MusicSortBy, UiMessageId][]>(Object.entries(SORT_LABEL_IDS))
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
  const { t } = useI18n()
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
    fetchNextPage,
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
    noun: 'admin.list.noun.music',
  })

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    tailKey: allMusics.at(-1)?.id,
  })

  const handlePlayAll = useCallback(() => {
    if (allMusics.length > 0) {
      load(allMusics[0], allMusics)
    }
  }, [allMusics, load])

  const handleNavigateToDetail = useCallback(
    (id: string) => {
      void navigate(`/admin/library/music/${id}`)
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
      <MusicLibraryHero musics={allMusics} total={total}>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={handlePlayAll}
            disabled={allMusics.length === 0}
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:opacity-40"
            aria-label={t('admin.musics.playAll')}
          >
            <Play className="size-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => {
              void navigate('/admin/library/music/add')
            }}
            className="flex shrink-0 items-center gap-2 rounded-full bg-surface-dim px-3 py-2.5 text-sm font-medium text-ink-1 transition-colors hover:bg-surface sm:px-5"
            aria-label={t('admin.musics.add')}
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t('admin.musics.add')}</span>
          </button>

          <div className="flex shrink-0 items-center overflow-hidden rounded-full bg-surface-dim">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-ink-1 transition-colors hover:bg-surface sm:px-4"
                aria-label={t('admin.musics.sort')}
              >
                <SortIcon sortBy={sortBy} sortOrder={sortOrder} />
                <span className="hidden sm:inline">{t(SORT_LABEL_IDS[sortBy])}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-40">
                {sortLabelEntries().map(([key, label]) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => handleSortChange(key)}
                    className={cn(sortBy === key ? 'text-ink-1' : 'text-ink-3')}
                  >
                    <span>{t(label)}</span>
                    {sortBy === key && (
                      <span className="ml-auto text-ink-4">
                        {sortOrder === 'asc' ? t('admin.sessions.sortAsc') : t('admin.sessions.sortDesc')}
                      </span>
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
              {sortOrder === 'asc' ? t('admin.sessions.sortAsc') : t('admin.sessions.sortDesc')}
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
              placeholder={t('admin.musics.searchPlaceholder')}
              aria-label={t('admin.musics.searchAria')}
              className="h-10 w-full rounded-full bg-surface-dim py-2 pr-4 pl-10 text-sm text-ink-1 transition-colors outline-none placeholder:text-ink-4 focus:bg-surface sm:w-64"
            />
          </form>
        </div>
      </MusicLibraryHero>

      {isLoading ? (
        <GridSkeleton />
      ) : allMusics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-ink-4">
          <p className="text-lg font-medium">{t('admin.musics.emptyTitle')}</p>
          <p className="mt-1 text-sm">{t('admin.musics.emptyHint')}</p>
          <button
            type="button"
            onClick={() => {
              void navigate('/admin/library/music/add')
            }}
            className="mt-6 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-105"
          >
            <Plus className="size-4" />
            {t('admin.musics.add')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {allMusics.map((row, index) => {
              const card = (
                <div onClick={() => handleNavigateToDetail(row.id)} className="cursor-pointer">
                  <AlbumCard music={row} />
                </div>
              )
              return index === allMusics.length - 1 ? (
                <Fragment key={row.id} ref={sentinelRef}>
                  {card}
                </Fragment>
              ) : (
                <Fragment key={row.id}>{card}</Fragment>
              )
            })}
          </div>

          <div className="mt-8 flex items-center justify-center">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-sm text-ink-4">
                <div className="size-4 animate-spin rounded-full border-2 border-line-muted border-t-primary" />
                {t('common.state.loading')}
              </div>
            )}
            {!hasNextPage && allMusics.length > 0 && (
              <p className="text-sm text-ink-4">{t('admin.musics.allLoaded', { count: total })}</p>
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
