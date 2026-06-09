import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import type { AdminMusicDto, MetingSearchHit } from '@/shared/types/music'

import { orpcQuery } from '@/client/api/orpc-query'
import { MusicLibraryHero } from '@/ui/admin/musics/MusicLibraryHero'
import { useMusicPlayer } from '@/ui/admin/musics/MusicPlayerContext'
import { SearchAlbumCard } from '@/ui/admin/musics/SearchAlbumCard'
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

export function AddMusicView() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<MetingSearchHit[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [addingSourceId, setAddingSourceId] = useState<string | null>(null)
  const [addedSourceIds, setAddedSourceIds] = useState<Set<string>>(new Set())

  const { currentTrack, isPlaying, load, toggle, close } = useMusicPlayer()

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
    onSuccess: () => {
      toast.success('音乐已添加')
      setAddingSourceId(null)
    },
    onError: (error) => {
      setAddingSourceId(null)
      setErrorMessage(error.message)
    },
  })
  const { mutate: submitAdd } = addMutation

  const triggerSearch = useCallback(() => {
    const trimmed = keyword.trim()
    if (trimmed === '') {
      setResults([])
      setErrorMessage(null)
      return
    }
    loadSearch({ keyword: trimmed, limit: 24 })
  }, [keyword, loadSearch])

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

  return (
    <div className="relative min-h-full animate-detail-enter">
      {/* Close button */}
      <button
        type="button"
        onClick={() => {
          // Stop preview when leaving the page so it doesn't leak into the library
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
        <div
          className="mx-auto flex max-w-sm animate-detail-fade-up items-center gap-2"
          style={{ animationDelay: '0.1s' }}
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
                    setResults([])
                    setErrorMessage(null)
                  }}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink-2"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </MusicLibraryHero>

      {/* Results */}
      <div className="animate-detail-fade-up" style={{ animationDelay: '0.2s' }}>
        {errorMessage !== null && (
          <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
        )}

        {isSearching && results.length === 0 ? (
          <GridSkeleton />
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-ink-4">
            <p className="text-lg font-medium">输入关键词搜索音乐</p>
            <p className="mt-1 text-sm">支持歌曲名称、艺人、专辑搜索</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {results.map((hit) => {
              const isCurrent = currentPreviewSourceId === hit.sourceId
              return (
                <SearchAlbumCard
                  key={hit.sourceId}
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
        )}
      </div>
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
