import { useMutation } from '@tanstack/react-query'
import { Loader2Icon, SearchIcon, XIcon } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { AdminMusicDto, MetingSearchHit, MetingSource } from '@/shared/contracts/music'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { toastApiError } from '@/client/lib/toast-api-error'
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
import { useI18n } from '@/ui/lib/I18nProvider'
import { skeletonKeys } from '@/ui/lib/skeleton-keys'

const RESULT_LIMIT_VALUES = [5, 10, 15, 20, 30] as const

export interface AddMusicDialogProps {
  open: boolean
  onClose: () => void
  onAdded: (music: AdminMusicDto) => void
}

export function AddMusicDialog({ open, onClose, onAdded }: AddMusicDialogProps) {
  const { t } = useI18n()
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

  // Infinite scroll in the dialog's scroll container, disarmed while a page is in flight.
  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: open && hasMore,
    isFetchingNextPage: isLoadingMore,
    fetchNextPage: loadMore,
    root: scrollRef,
    rootMargin: '0px',
    tailKey: results.length,
  })

  const addMutation = useMutation({
    ...orpcQuery.admin.music.add.mutationOptions(),
    onSuccess: (payload) => {
      toast.success(t('admin.musics.toastAdded'))
      setAddingSourceId(null)
      onAdded(payload.music)
      setAddedSourceIds((prev) => new Set(prev).add(payload.music.sourceId))
    },
    onError: (error) => {
      setAddingSourceId(null)
      toastApiError(error, 'admin.toast.musicAddFailed', t)
    },
  })
  const { mutate: submitAdd } = addMutation

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setKeyword('')
      setSource('netease')
      setAddedSourceIds(new Set())
      setAddingSourceId(null)
      reset()
    }
  }

  // Stop the preview player on close — an ancestor setState, so it must run in an
  // effect (gated on the open→closed transition), not in the render-adjust block above.
  const wasOpenRef = useRef(open)
  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = open
    if (wasOpen && !open && currentTrack && isPreviewId(currentTrack.id)) {
      close()
    }
  }, [open, currentTrack, close])

  const triggerSearch = useCallback(() => {
    search({ source, keyword })
  }, [search, source, keyword])

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
          <DialogTitle>{t('admin.musics.addDialog.title')}</DialogTitle>
          <DialogDescription>{t('admin.musics.addDialog.description')}</DialogDescription>
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
                placeholder={t('admin.musics.addDialog.keywordPlaceholder')}
              />
            </InputGroup>
            <Button type="submit" disabled={isSearching || keyword.trim() === ''}>
              {isSearching ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}{' '}
              {t('admin.musics.addDialog.search')}
            </Button>
          </form>
          <div className="flex shrink-0 items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="add-music-source" className="text-xs whitespace-nowrap text-muted-foreground">
                {t('admin.musics.addDialog.source')}
              </Label>
              <Select
                items={SOURCE_OPTIONS.map((item) => ({ value: item.value, label: t(item.labelId) }))}
                value={source}
                onValueChange={(value) => setSource((value ?? 'netease') as MetingSource)}
              >
                <SelectTrigger id="add-music-source" size="sm" className="w-28" />
                <SelectContent>
                  {SOURCE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {t(item.labelId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="add-music-limit" className="text-xs whitespace-nowrap text-muted-foreground">
                {t('admin.musics.addDialog.perPage')}
              </Label>
              <Select
                items={RESULT_LIMIT_VALUES.map((n) => ({
                  value: String(n),
                  label: t('admin.musics.addDialog.limitOption', { count: n }),
                }))}
                value={String(searchLimit)}
                onValueChange={() => void 0}
              >
                <SelectTrigger id="add-music-limit" size="sm" className="w-20" disabled>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESULT_LIMIT_VALUES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t('admin.musics.addDialog.limitOption', { count: n })}
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
              <p className="text-sm text-muted-foreground">{t('admin.musics.addDialog.emptyHint')}</p>
            ) : (
              results.map((hit, index) => {
                const previewId = `preview:${hit.sourceId}`
                const item = (
                  <SearchResultItem
                    hit={hit}
                    previewActive={currentTrack?.id === previewId && isPlaying}
                    adding={addingSourceId === hit.sourceId}
                    added={addedSourceIds.has(hit.sourceId)}
                    onPreview={onPreview}
                    onAdd={onAdd}
                  />
                )
                const key = `${hit.source}:${hit.sourceId}`
                return index === results.length - 1 ? (
                  <Fragment key={key} ref={sentinelRef}>
                    {item}
                  </Fragment>
                ) : (
                  <Fragment key={key}>{item}</Fragment>
                )
              })
            )}
            {isLoadingMore ? (
              <div className="flex justify-center py-2">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            <XIcon /> {t('common.action.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
