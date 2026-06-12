import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon, SearchIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { AdminMusicDto, MetingSource, MetingSearchHit } from '@/shared/types/music'

import { orpcQuery } from '@/client/api/orpc-query'
import { useMusicPlayerActions, useMusicPlayerState } from '@/ui/admin/musics/MusicPlayerContext'
import { SearchResultItem } from '@/ui/admin/musics/SearchResultItem'
import { Button } from '@/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/components/input-group'
import { Label } from '@/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Skeleton } from '@/ui/components/skeleton'

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'netease', label: '网易云' },
  { value: 'tencent', label: 'QQ音乐' },
]

const RESULT_LIMIT_OPTIONS: { value: string; label: string }[] = [5, 10, 15, 20, 30].map((n) => ({
  value: String(n),
  label: `${n} 条`,
}))

function hitToPreviewTrack(hit: MetingSearchHit & { previewUrl?: string }): AdminMusicDto {
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

export interface AddMusicDialogProps {
  open: boolean
  onClose: () => void
  onAdded: (music: AdminMusicDto) => void
}

const SEARCH_LIMIT = 10

export function AddMusicDialog({ open, onClose, onAdded }: AddMusicDialogProps) {
  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState<MetingSource>('netease')
  const [results, setResults] = useState<MetingSearchHit[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [enabled, setEnabled] = useState(false)
  const [addingSourceId, setAddingSourceId] = useState<string | null>(null)
  const [addedSourceIds, setAddedSourceIds] = useState<Set<string>>(new Set())

  const { currentTrack, isPlaying } = useMusicPlayerState()
  const { toggle, close, load } = useMusicPlayerActions()
  const queryClient = useQueryClient()

  const searchQuery = useQuery({
    ...orpcQuery.admin.music.search.queryOptions({
      input: { source, keyword, limit: SEARCH_LIMIT, offset: nextOffset },
      staleTime: 0,
    }),
    enabled,
  })

  const addMutation = useMutation({
    ...orpcQuery.admin.music.add.mutationOptions(),
    onSuccess: (payload) => {
      toast.success('音乐已添加')
      setAddingSourceId(null)
      onAdded(payload.music)
      setAddedSourceIds((prev) => new Set(prev).add(payload.music.sourceId))
    },
    onError: (error) => {
      setAddingSourceId(null)
      toast.error(error.message)
    },
  })
  const { mutate: submitAdd } = addMutation

  // Reset on dialog close
  useEffect(() => {
    if (!open) {
      setKeyword('')
      setSource('netease')
      setResults([])
      setHasMore(false)
      setNextOffset(0)
      setEnabled(false)
      setAddedSourceIds(new Set())
      setAddingSourceId(null)
      queryClient.removeQueries({ queryKey: orpcQuery.admin.music.search.key({ input: {} }) })
      if (currentTrack && isPreviewId(currentTrack.id)) {
        close()
      }
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerSearch = useCallback(() => {
    if (keyword.trim() === '') {
      return
    }
    setResults([])
    setNextOffset(0)
    setEnabled(true)
  }, [keyword])

  // Keep latest flags in refs so loadMore reference is stable.
  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore
  const isFetchingRef = useRef(searchQuery.isFetching)
  isFetchingRef.current = searchQuery.isFetching

  const loadMore = useCallback(() => {
    if (!hasMoreRef.current || isFetchingRef.current) {
      return
    }
    setNextOffset((prev) => prev + SEARCH_LIMIT)
  }, [])

  // Handle search results — accumulate for pagination
  useEffect(() => {
    if (!searchQuery.data) {
      return
    }
    const newResults = searchQuery.data.results
    const hasMoreData = searchQuery.data.hasMore
    setResults((prev) => {
      if (prev.length === 0) {
        return newResults
      }
      // Deduplicate by source+sourceId
      const existing = new Set(prev.map((r) => `${r.source}:${r.sourceId}`))
      return [...prev, ...newResults.filter((r) => !existing.has(`${r.source}:${r.sourceId}`))]
    })
    setHasMore(hasMoreData)
    if (!hasMoreData) {
      setEnabled(false)
    }
    // Auto-load next page if sentinel is still inside scroll container and more pages exist
    if (hasMoreData && !searchQuery.isFetching) {
      requestAnimationFrame(() => {
        if (!sentinelRef.current || !scrollRef.current) {
          return
        }
        const sentinelRect = sentinelRef.current.getBoundingClientRect()
        const scrollRect = scrollRef.current.getBoundingClientRect()
        if (sentinelRect.top < scrollRect.bottom) {
          loadMore()
        }
      })
    }
  }, [loadMore, searchQuery.data, searchQuery.isFetching])

  const onPreview = useCallback(
    (hit: MetingSearchHit & { previewUrl?: string }) => {
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

  const onAdd = useCallback(
    (hit: MetingSearchHit) => {
      if (addingSourceId !== null) {
        return
      }
      setAddingSourceId(hit.sourceId)
      submitAdd({ source: hit.source, sourceId: hit.sourceId })
    },
    [addingSourceId, submitAdd],
  )

  // Infinite scroll via IntersectionObserver
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !sentinelRef.current || !scrollRef.current) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadMore()
        }
      },
      { root: scrollRef.current, threshold: 0 },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore, open])

  const isSearching = searchQuery.isFetching && nextOffset === 0
  const isLoadingMore = searchQuery.isFetching && nextOffset > 0
  const errorMessage = searchQuery.error?.message ?? null

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="flex h-[80vh] max-h-[640px] w-full flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>添加音乐</DialogTitle>
          <DialogDescription>
            搜索并添加音乐到曲库。点击「试听」可在浏览器中预览，「添加」会下载音频与封面到本站 S3 并入库。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 border-b px-6 py-3">
          <form
            className="flex flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              triggerSearch()
            }}
          >
            <InputGroup className="flex-1">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="例：Adele Hello、稻香、夜曲"
              />
            </InputGroup>
            <Button type="submit" disabled={isSearching || keyword.trim() === ''}>
              {isSearching ? <Loader2Icon className="animate-spin" /> : <SearchIcon />} 搜索
            </Button>
          </form>
          <div className="flex shrink-0 items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="add-music-source" className="text-xs whitespace-nowrap text-muted-foreground">
                来源
              </Label>
              <Select
                items={SOURCE_OPTIONS}
                value={source}
                onValueChange={(value) => setSource((value ?? 'netease') as MetingSource)}
              >
                <SelectTrigger id="add-music-source" size="sm" className="w-28" />
                <SelectContent>
                  {SOURCE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="add-music-limit" className="text-xs whitespace-nowrap text-muted-foreground">
                每页
              </Label>
              <Select items={RESULT_LIMIT_OPTIONS} value={String(SEARCH_LIMIT)} onValueChange={() => void 0}>
                <SelectTrigger id="add-music-limit" size="sm" className="w-20" disabled>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESULT_LIMIT_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {errorMessage !== null ? (
            <p className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
          ) : null}

          <div className="flex flex-col gap-2">
            {(isSearching || isLoadingMore) && results.length === 0 ? (
              Array.from({ length: 3 }).map((_, index) => (
                // oxlint-disable-next-line react/no-array-index-key
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))
            ) : results.length === 0 ? (
              <p className="text-sm text-muted-foreground">输入关键词后点击搜索。</p>
            ) : (
              results.map((hit) => {
                const decorated = hit as MetingSearchHit & {
                  previewUrl?: string
                  _added?: boolean
                }
                const previewId = `preview:${hit.sourceId}`
                return (
                  <SearchResultItem
                    key={`${hit.source}:${hit.sourceId}`}
                    hit={decorated}
                    previewActive={currentTrack?.id === previewId && isPlaying}
                    adding={addingSourceId === hit.sourceId}
                    added={addedSourceIds.has(hit.sourceId)}
                    onPreview={onPreview}
                    onAdd={onAdd}
                  />
                )
              })
            )}
            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-1" />
            {isLoadingMore ? (
              <div className="flex justify-center py-2">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            <XIcon /> 关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
