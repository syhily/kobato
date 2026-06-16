import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import type { AdminMusicDto, MetingSource, MetingSearchHit } from '@/shared/types/music'

import { orpcQuery } from '@/client/api/orpc-query'
import { transitions } from '@/client/lib/motion'
import { MusicLibraryHero } from '@/ui/admin/musics/MusicLibraryHero'
import { useMusicPlayerActions, useMusicPlayerState } from '@/ui/admin/musics/MusicPlayerContext'
import { SearchAlbumCard } from '@/ui/admin/musics/SearchAlbumCard'
import { Label } from '@/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/ui/components/select'

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'netease', label: '网易云' },
  { value: 'tencent', label: 'QQ音乐' },
]

function hitToPreviewTrack(hit: MetingSearchHit): AdminMusicDto {
  return {
    id: `preview:${hit.sourceId}`,
    source: hit.source,
    sourceId: hit.sourceId,
    playerId: `preview:${hit.sourceId}`,
    name: hit.name,
    artist: hit.artist,
    album: hit.album,
    audioStoragePath: '',
    audioUrl: hit.previewUrl ?? '',
    coverStoragePath: '',
    coverUrl: hit.coverUrl,
    lyric: null,
    uploaderId: null,
    uploaderName: null,
    createdAt: '',
    updatedAt: '',
  }
}

function isPreviewId(id: string | undefined): boolean {
  return id !== undefined && id.startsWith('preview:')
}

const SEARCH_LIMIT = 24

export function AddMusicView() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState<MetingSource>('netease')
  const [results, setResults] = useState<MetingSearchHit[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [searchedKeyword, setSearchedKeyword] = useState('')
  const [addingSourceId, setAddingSourceId] = useState<string | null>(null)
  const [addedSourceIds, setAddedSourceIds] = useState<Set<string>>(new Set())

  const { currentTrack, isPlaying } = useMusicPlayerState()
  const { load, toggle, close } = useMusicPlayerActions()
  const queryClient = useQueryClient()

  const libraryInput = useMemo(() => ({ offset: 0, limit: 30 }), [])
  const libraryQuery = useQuery(
    orpcQuery.admin.music.list.queryOptions({
      input: libraryInput,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    }),
  )
  const libraryMusics = libraryQuery.data?.musics ?? []
  const libraryTotal = libraryQuery.data?.total ?? 0

  const searchQuery = useQuery({
    ...orpcQuery.admin.music.search.queryOptions({
      input: { source, keyword: searchedKeyword, limit: SEARCH_LIMIT, offset: nextOffset },
      staleTime: 0,
    }),
    enabled: searchedKeyword.length > 0,
  })

  const addMutation = useMutation({
    ...orpcQuery.admin.music.add.mutationOptions(),
    onSuccess: () => {
      toast.success('音乐已添加')
      setAddingSourceId(null)
    },
    onError: (error) => {
      setAddingSourceId(null)
      toast.error(error.message)
    },
  })
  const { mutate: submitAdd } = addMutation

  // Keep latest flags in refs so loadMore reference is stable.
  const hasMoreRef = useRef(hasMore)
  const isFetchingRef = useRef(searchQuery.isFetching)
  useEffect(() => {
    hasMoreRef.current = hasMore
    isFetchingRef.current = searchQuery.isFetching
  })

  const loadMore = useCallback(() => {
    if (!hasMoreRef.current || isFetchingRef.current) {
      return
    }
    setNextOffset((prev) => prev + SEARCH_LIMIT)
  }, [])

  const triggerSearch = useCallback(() => {
    const trimmed = keyword.trim()
    if (trimmed === '') {
      return
    }
    setResults([])
    setNextOffset(0)
    setSearchedKeyword(trimmed)
  }, [keyword])

  // Handle search results — accumulate for pagination. Adjust state during
  // render when the data reference changes, instead of in an effect.
  const [lastAppliedData, setLastAppliedData] = useState(searchQuery.data)
  if (searchQuery.data !== lastAppliedData) {
    setLastAppliedData(searchQuery.data)
    if (searchQuery.data) {
      const newResults = searchQuery.data.results
      const hasMoreData = searchQuery.data.hasMore
      setResults((prev) => {
        if (prev.length === 0) {
          return newResults
        }
        const existing = new Set(prev.map((r) => `${r.source}:${r.sourceId}`))
        return [...prev, ...newResults.filter((r) => !existing.has(`${r.source}:${r.sourceId}`))]
      })
      setHasMore(hasMoreData)
    }
  }
  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  const handleAdd = useCallback(
    (hit: MetingSearchHit) => {
      if (addingSourceId !== null) {
        return
      }
      setAddingSourceId(hit.sourceId)
      submitAdd(
        { source: hit.source, sourceId: hit.sourceId },
        {
          onSuccess: () => {
            setAddedSourceIds((prev) => new Set(prev).add(hit.sourceId))
          },
        },
      )
    },
    [addingSourceId, submitAdd],
  )

  const onPreview = useCallback(
    (hit: MetingSearchHit) => {
      const previewId = `preview:${hit.sourceId}`
      if (currentTrack?.id === previewId) {
        toggle()
        return
      }
      if (hit.previewUrl) {
        load(hitToPreviewTrack(hit))
      }
    },
    [currentTrack, toggle, load],
  )

  const currentPreviewSourceId = useMemo(() => {
    if (currentTrack && isPreviewId(currentTrack.id)) {
      return currentTrack.sourceId
    }
    return null
  }, [currentTrack])

  // Infinite scroll via IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || searchQuery.isFetching) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadMore()
        }
      },
      { rootMargin: '200px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, hasMore, searchQuery.isFetching, results.length])

  const isSearching = searchQuery.isFetching && nextOffset === 0
  const isLoadingMore = searchQuery.isFetching && nextOffset > 0
  const errorMessage = searchQuery.error?.message ?? null

  return (
    <motion.div
      className="relative min-h-full"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transitions.detailFade}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={() => {
          if (currentTrack && isPreviewId(currentTrack.id)) {
            close()
          }
          void navigate('/admin/library/music')
        }}
        className="absolute top-2 right-0 z-40 flex size-10 items-center justify-center rounded-full bg-surface-dim/80 text-ink-3 backdrop-blur-sm transition-all hover:scale-110 hover:bg-surface hover:text-ink-1 active:scale-95 lg:top-4"
        aria-label="关闭"
      >
        <X className="size-5" />
      </button>

      {/* Hero */}
      <MusicLibraryHero musics={libraryMusics} total={libraryTotal} title="添加音乐">
        <motion.div
          className="mx-auto flex max-w-sm items-center gap-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transitions.detailFade, delay: 0.1 }}
        >
          <form
            className="flex w-full"
            onSubmit={(event) => {
              event.preventDefault()
              triggerSearch()
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索歌曲、艺人、专辑..."
                aria-label="搜索音乐"
                className="h-10 w-full rounded-full bg-surface-dim py-2 pr-10 pl-10 text-sm text-ink-1 transition-colors outline-none placeholder:text-ink-4 focus:bg-surface sm:w-full"
              />
              {isSearching ? (
                <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-ink-4" />
              ) : keyword.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setKeyword('')
                    setSearchedKeyword('')
                    setResults([])
                    setNextOffset(0)
                    queryClient.removeQueries({
                      queryKey: orpcQuery.admin.music.search.key({ input: {} }),
                    })
                  }}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink-2"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </form>
          <div className="flex shrink-0 items-center gap-2">
            <Label htmlFor="add-music-source-full" className="text-xs whitespace-nowrap text-white/80">
              来源
            </Label>
            <Select
              items={SOURCE_OPTIONS}
              value={source}
              onValueChange={(value) => setSource((value ?? 'netease') as MetingSource)}
            >
              <SelectTrigger id="add-music-source-full" size="sm" className="w-28 bg-surface-dim" />
              <SelectContent>
                {SOURCE_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      </MusicLibraryHero>

      {/* Results */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.detailFade, delay: 0.2 }}
      >
        {errorMessage !== null && (
          <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
        )}

        {(isSearching || isLoadingMore) && results.length === 0 ? (
          <GridSkeleton />
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-ink-4">
            <p className="text-lg font-medium">输入关键词搜索音乐</p>
            <p className="mt-1 text-sm">支持歌曲名称、艺人、专辑搜索</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {results.map((hit) => {
                const isCurrent = currentPreviewSourceId === hit.sourceId
                return (
                  <SearchAlbumCard
                    key={`${hit.source}:${hit.sourceId}`}
                    hit={hit}
                    adding={addingSourceId === hit.sourceId}
                    added={addedSourceIds.has(hit.sourceId)}
                    isCurrent={isCurrent}
                    isPlaying={isCurrent && isPlaying}
                    onAdd={handleAdd}
                    onPreview={onPreview}
                  />
                )
              })}
            </div>
            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-4" />
            {isLoadingMore ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-6 animate-spin text-ink-4" />
              </div>
            ) : null}
          </>
        )}
      </motion.div>
    </motion.div>
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
