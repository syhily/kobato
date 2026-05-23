import { Loader2Icon, SearchIcon, XIcon } from 'lucide-react'
import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { AdminMusicDto, MetingSearchHit } from '@/shared/types/music'

import { useMutation, orpcQuery } from '@/client/api/query'
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
import { AudioPreviewPlayer } from '@/ui/admin/musics/AudioPreviewPlayer'
import {
  INITIAL_PREVIEW_PROGRESS,
  type PreviewProgress,
  SearchResultItem,
} from '@/ui/admin/musics/SearchResultItem'

// Result-count options. The schema caps `limit` at 30 server-side
// (see `searchMusicSchema` in `@/server/domains/music/schema`); the upper
// bound here mirrors that. 10 is the default because the netease
// front-end usually returns ~10 high-relevance hits before quality
// drops off — going higher mostly adds longer-tail noise.
const RESULT_LIMIT_OPTIONS: { value: string; label: string }[] = [5, 10, 15, 20, 30].map((n) => ({
  value: String(n),
  label: `${n} 条`,
}))

export interface AddMusicDialogProps {
  open: boolean
  onClose: () => void
  /**
   * Fires after each successful "添加" so the parent list can prepend
   * the new row. The dialog stays open after each add to support
   * adding several songs in sequence.
   */
  onAdded: (music: AdminMusicDto) => void
}

// Add-music dialog. Search is keyed on the netease provider only —
// see `MetingSource` in `@/shared/types/music` and the rationale in the
// plan: meting's per-provider responses diverge enough that we
// commit to a single provider for the first iteration.
//
// Workflow:
//   1. Operator types a keyword → `searchMusic` returns 10 hits, each
//      pre-resolved with `coverUrl` (small thumb) and `previewUrl`
//      (short-lived netease CDN link).
//   2. Operator clicks "试听" → an inline `<audio>` plays the preview
//      URL directly. We never persist the previewUrl.
//   3. Operator clicks "添加" → `addMusic({ source, sourceId })` and
//      the row gets prepended to the parent list. Dialog stays open.

export function AddMusicDialog({ open, onClose, onAdded }: AddMusicDialogProps) {
  const [keyword, setKeyword] = useState('')
  const [resultLimit, setResultLimit] = useState(10)
  const [results, setResults] = useState<MetingSearchHit[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [addingSourceId, setAddingSourceId] = useState<string | null>(null)
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null)
  const [previewProgress, setPreviewProgress] = useState<PreviewProgress>(INITIAL_PREVIEW_PROGRESS)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  const searchMutation = useMutation({
    ...orpcQuery.admin.music.search.mutationOptions(),
    onSuccess: (payload) => {
      setErrorMessage(null)
      setResults(payload.results)
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })
  const { mutate: loadSearch, isPending: isSearching } = searchMutation

  const addMutation = useMutation({
    ...orpcQuery.admin.music.add.mutationOptions(),
    onSuccess: (payload) => {
      toast.success('音乐已添加')
      setErrorMessage(null)
      setAddingSourceId(null)
      onAdded(payload.music)
      // Mark the just-added hit so the list shows a clear "已添加" cue.
      setResults(
        (prev) =>
          prev.map((hit) => (hit.sourceId === payload.music.sourceId ? { ...hit, _added: true } : hit)) as typeof prev,
      )
    },
    onError: (error) => {
      setAddingSourceId(null)
      setErrorMessage(error.message)
    },
  })
  const { mutate: submitAdd } = addMutation

  useEffect(() => {
    if (!open) {
      setKeyword('')
      setResults([])
      setErrorMessage(null)
      setAddingSourceId(null)
      setPreviewSourceId(null)
      setPreviewProgress(INITIAL_PREVIEW_PROGRESS)
      const audio = audioRef.current
      if (audio !== null) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    }
  }, [open])

  const triggerSearch = useCallback(() => {
    const trimmed = keyword.trim()
    if (trimmed === '') {
      setResults([])
      setErrorMessage(null)
      return
    }
    loadSearch({ keyword: trimmed, limit: resultLimit })
  }, [keyword, loadSearch, resultLimit])

  const onPreview = useCallback(
    (hit: MetingSearchHit & { previewUrl?: string }) => {
      const audio = audioRef.current
      const previewUrl = hit.previewUrl
      if (audio === null || previewUrl === undefined || previewUrl === '') {
        return
      }
      if (previewSourceId === hit.sourceId) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        setPreviewSourceId(null)
        setPreviewProgress(INITIAL_PREVIEW_PROGRESS)
        return
      }
      audio.src = previewUrl
      audio.play().catch(() => undefined)
      setPreviewSourceId(hit.sourceId)
      // Reset progress immediately; the `loadedmetadata` listener
      // below populates `duration` once the headers come in, and
      // `timeupdate` then drives `currentTime`.
      setPreviewProgress(INITIAL_PREVIEW_PROGRESS)
    },
    [previewSourceId],
  )

  // Seek by clicking the progress bar of the currently-playing hit.
  // The handler is at the top level so each row's progress bar can
  // close over the same audio ref; the `disabled` styling on the
  // bar prevents seeks before metadata arrives.
  const onSeek = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (audio === null || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) {
      return
    }
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
    setPreviewProgress((prev) => ({ ...prev, currentTime: ratio * audio.duration }))
  }, [])

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
      {/*
       * Fixed-size dialog: a clamped width keeps the search hits at a
       * comfortable line length on wide monitors (instead of stretching
       * across the screen), and `h-[80vh]` plus `flex-col` carve the
       * popup into a fixed header + toolbar + scroll-region + footer.
       * The scroll region is the ONLY part that grows; the rest stays
       * pinned so the search input is always one click away regardless
       * of how far the operator has scrolled.
       */}
      <DialogContent className="flex h-[80vh] max-h-[640px] w-full flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>添加音乐</DialogTitle>
          <DialogDescription>
            通过 NetEase 搜索；点击「试听」可在浏览器中预览，「添加」会下载音频与封面到本站 S3 并入库。
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
          <div className="flex shrink-0 items-center gap-2">
            <Label htmlFor="add-music-limit" className="text-xs whitespace-nowrap text-muted-foreground">
              结果数
            </Label>
            <Select
              items={RESULT_LIMIT_OPTIONS}
              value={String(resultLimit)}
              onValueChange={(value) => setResultLimit(Number.parseInt(value ?? '10', 10))}
            >
              <SelectTrigger id="add-music-limit" size="sm" className="w-24">
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

        {/*
         * Scroll region. `min-h-0` is load-bearing — without it the
         * flex child's intrinsic content height defeats `flex-1` and
         * the dialog footer floats off-screen on long result lists.
         */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {errorMessage !== null ? (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
          ) : null}

          <div className="flex flex-col gap-2">
            {isSearching && results.length === 0 ? (
              Array.from({ length: 3 }).map((_, index) => (
                // Skeleton placeholders — identical, swapped wholesale on load.
                // oxlint-disable-next-line react/no-array-index-key
                <Skeleton key={index} className="h-16 w-full rounded-md" />
              ))
            ) : results.length === 0 ? (
              <p className="text-sm text-muted-foreground">输入关键词后点击搜索。</p>
            ) : (
              results.map((hit) => {
                const decorated = hit as MetingSearchHit & {
                  previewUrl?: string
                  _added?: boolean
                }
                return (
                  <SearchResultItem
                    key={hit.sourceId}
                    hit={decorated}
                    previewActive={previewSourceId === hit.sourceId}
                    adding={addingSourceId === hit.sourceId}
                    added={decorated._added === true}
                    previewProgress={previewSourceId === hit.sourceId ? previewProgress : null}
                    onPreview={onPreview}
                    onAdd={onAdd}
                    onSeek={onSeek}
                  />
                )
              })
            )}
          </div>
        </div>

        <AudioPreviewPlayer
          audioRef={audioRef}
          onLoadedMetadata={(duration) => {
            setPreviewProgress((prev) => ({
              ...prev,
              duration: duration > 0 ? duration : null,
            }))
          }}
          onTimeUpdate={(currentTime) => {
            setPreviewProgress((prev) => ({ ...prev, currentTime }))
          }}
          onEnded={() => {
            setPreviewSourceId(null)
            setPreviewProgress(INITIAL_PREVIEW_PROGRESS)
          }}
          onPause={(currentTime) => {
            if (currentTime === 0) {
              setPreviewSourceId(null)
              setPreviewProgress(INITIAL_PREVIEW_PROGRESS)
            }
          }}
        />

        <DialogFooter className="border-t px-6 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            <XIcon /> 关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
