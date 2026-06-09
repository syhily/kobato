import { useMutation } from '@tanstack/react-query'
import { Loader2Icon, SearchIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { AdminMusicDto, MetingSearchHit } from '@/shared/types/music'

import { orpcQuery } from '@/client/api/orpc-query'
import { useMusicPlayer } from '@/ui/admin/musics/MusicPlayerContext'
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

export function AddMusicDialog({ open, onClose, onAdded }: AddMusicDialogProps) {
  const [keyword, setKeyword] = useState('')
  const [resultLimit, setResultLimit] = useState(10)
  const [results, setResults] = useState<MetingSearchHit[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [addingSourceId, setAddingSourceId] = useState<string | null>(null)

  const { currentTrack, isPlaying, toggle, close, load } = useMusicPlayer()

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

  // Reset state on dialog close and stop any active preview
  useEffect(() => {
    if (!open) {
      setKeyword('')
      setResults([])
      setErrorMessage(null)
      setAddingSourceId(null)
      // Stop preview if currently playing a search result
      if (currentTrack && isPreviewId(currentTrack.id)) {
        close()
      }
    }
  }, [open, currentTrack, close])

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

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {errorMessage !== null ? (
            <p className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
          ) : null}

          <div className="flex flex-col gap-2">
            {isSearching && results.length === 0 ? (
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
                    key={hit.sourceId}
                    hit={decorated}
                    previewActive={currentTrack?.id === previewId && isPlaying}
                    adding={addingSourceId === hit.sourceId}
                    added={decorated._added === true}
                    onPreview={onPreview}
                    onAdd={onAdd}
                  />
                )
              })
            )}
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
