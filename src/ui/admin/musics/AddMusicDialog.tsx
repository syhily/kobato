import { useMutation } from '@tanstack/react-query'
import { Loader2Icon, SearchIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { AdminMusicDto, MetingSearchHit, MetingSource } from '@/shared/types/music'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { hitToPreviewTrack, isPreviewId, SOURCE_OPTIONS } from '@/ui/admin/musics/meting-search'
import { useMusicPlayerActions, useMusicPlayerState } from '@/ui/admin/musics/MusicPlayerContext'
import { SearchResultItem } from '@/ui/admin/musics/SearchResultItem'
import { useMetingMusicSearch } from '@/ui/admin/musics/useMetingMusicSearch'
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
import { skeletonKeys } from '@/ui/lib/skeleton-keys'

const RESULT_LIMIT_OPTIONS: { value: string; label: string }[] = [5, 10, 15, 20, 30].map((n) => ({
  value: String(n),
  label: `${n} 条`,
}))

export interface AddMusicDialogProps {
  open: boolean
  onClose: () => void
  onAdded: (music: AdminMusicDto) => void
}

export function AddMusicDialog({ open, onClose, onAdded }: AddMusicDialogProps) {
  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState<MetingSource>('netease')
  const [addingSourceId, setAddingSourceId] = useState<string | null>(null)
  const [addedSourceIds, setAddedSourceIds] = useState<Set<string>>(new Set())

  const scrollRef = useRef<HTMLDivElement>(null)

  const { currentTrack, isPlaying } = useMusicPlayerState()
  const { toggle, close, load } = useMusicPlayerActions()

  // The limit feeds both the hook and the disabled per-page select's display.
  const searchLimit = 10
  const {
    results,
    hasMore,
    isSearching,
    isLoadingMore,
    error: errorMessage,
    search,
    loadMore,
    reset,
  } = useMetingMusicSearch({ limit: searchLimit })

  // Infinite scroll inside the dialog's own scroll container — disarms
  // while a page is in flight; `loadMore` self-guards too.
  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: open && hasMore,
    isFetchingNextPage: isLoadingMore,
    fetchNextPage: loadMore,
    root: scrollRef,
    rootMargin: '0px',
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
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setKeyword('')
      setSource('netease')
      setAddedSourceIds(new Set())
      setAddingSourceId(null)
      reset()
      if (currentTrack && isPreviewId(currentTrack.id)) {
        close()
      }
    }
  }

  const triggerSearch = useCallback(() => {
    search({ source, keyword })
  }, [search, source, keyword])

  // Auto-load next page if the sentinel is still inside the scroll container
  // and more pages exist. Reads geometry in an effect (post-render) so we
  // don't touch refs during render.
  useEffect(() => {
    if (!hasMore) {
      return
    }
    const id = requestAnimationFrame(() => {
      if (!sentinelRef.current || !scrollRef.current) {
        return
      }
      const sentinelRect = sentinelRef.current.getBoundingClientRect()
      const scrollRect = scrollRef.current.getBoundingClientRect()
      if (sentinelRect.top < scrollRect.bottom) {
        loadMore()
      }
    })
    return () => cancelAnimationFrame(id)
    // `sentinelRef` / `scrollRef` are stable ref objects (the former is
    // returned from a hook, so the lint rule can't prove it) — listing them
    // is a no-op that satisfies exhaustive-deps.
  }, [hasMore, loadMore, sentinelRef])

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
              <Select items={RESULT_LIMIT_OPTIONS} value={String(searchLimit)} onValueChange={() => void 0}>
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
              skeletonKeys(3).map((key) => <Skeleton key={key} className="h-16 w-full rounded-xl" />)
            ) : results.length === 0 ? (
              <p className="text-sm text-muted-foreground">输入关键词后点击搜索。</p>
            ) : (
              results.map((hit) => {
                const previewId = `preview:${hit.sourceId}`
                return (
                  <SearchResultItem
                    key={`${hit.source}:${hit.sourceId}`}
                    hit={hit}
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
