import type { NavigateFunction } from 'react-router'

import { type InfiniteData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Pause, Trash2, X, Copy, Pencil, Check, RotateCcw } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import type { ListMusicOutput } from '@/shared/contracts/music'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { transitions } from '@/client/lib/motion'
import { onMutationError } from '@/client/lib/toast-api-error'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { LyricsDisplay } from '@/ui/admin/musics/LyricsDisplay'
import { buildMusicUpdate } from '@/ui/admin/musics/music-update'
import { useMusicPlayerActions, useMusicPlayerState, useMusicPlayerTime } from '@/ui/admin/musics/MusicPlayerContext'
import { ConfirmDialog, type ConfirmState } from '@/ui/admin/shared/ConfirmDialog'
import { LazyMotionDiv, LazyMotionH1, LazyMotionP, LazyMotionSpan } from '@/ui/components/lazy-motion'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
import { Image } from '@/ui/public/widgets/Image'

const DATE_FORMAT = 'yyyy-LL-dd'

interface MusicDetailViewProps {
  id: string
  navigate: NavigateFunction
}

export function MusicDetailView({ id, navigate }: MusicDetailViewProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const config = useSiteIdentity()
  const { load, toggle } = useMusicPlayerActions()
  const { currentTrack, isPlaying } = useMusicPlayerState()
  const currentTime = useMusicPlayerTime()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)

  // Reset editing state when navigating between different songs
  const [lastId, setLastId] = useState(id)
  if (id !== lastId) {
    setLastId(id)
    setEditing(false)
    setConfirm(null)
    setCopied(false)
  }

  const musicQuery = useQuery({
    ...orpcQuery.admin.music.get.queryOptions({
      input: { id },
      enabled: id !== '',
    }),
    // Seed from any cached music-list page so the hero (and its shared-element
    // transition partner in AlbumCard) renders inside the navigation transition.
    placeholderData: () => {
      for (const [, data] of queryClient.getQueriesData<InfiniteData<ListMusicOutput, number>>({
        queryKey: orpcQuery.admin.music.list.key(),
      })) {
        const row = data?.pages.flatMap((page) => page.musics).find((candidate) => candidate.id === id)
        if (row) {
          return { music: row }
        }
      }
      return undefined
    },
  })

  const music = musicQuery.data?.music
  const isCurrent = currentTrack?.id === music?.id
  const isCurrentPlaying = isCurrent && isPlaying

  const [draftName, setDraftName] = useState('')
  const [draftArtist, setDraftArtist] = useState('')
  const [draftAlbum, setDraftAlbum] = useState('')
  const [draftLyric, setDraftLyric] = useState<string | undefined>('')

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; name: string; artist: string[]; album: string; lyric?: string }) =>
      orpc.admin.music.update(input),
    onSuccess: (data) => {
      queryClient.setQueryData(orpcQuery.admin.music.get.key({ input: { id } }), { music: data.music })
      // The library is cached under both operation types — the procedure-level key matches both.
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.music.list.key() })
      toast.success(t('admin.musics.detail.saved'))
      setEditing(false)
    },
    onError: onMutationError('admin.toast.saveFailed', t),
  })

  const enterEdit = useCallback(() => {
    if (!music) {
      return
    }
    setDraftName(music.name)
    setDraftArtist(music.artist.join(' / '))
    setDraftAlbum(music.album)
    setDraftLyric(music.lyric ?? '')
    setEditing(true)
  }, [music])

  const cancelEdit = useCallback(() => {
    setEditing(false)
  }, [])

  const saveEdit = useCallback(() => {
    if (!music) {
      return
    }
    updateMutation.mutate(
      buildMusicUpdate(music, { name: draftName, artist: draftArtist, album: draftAlbum, lyric: draftLyric }),
    )
  }, [music, draftName, draftArtist, draftAlbum, draftLyric, updateMutation])

  const handlePlay = useCallback(() => {
    if (!music) {
      return
    }
    if (isCurrent) {
      toggle()
    } else {
      load(music)
    }
  }, [music, isCurrent, toggle, load])

  const handleCopyId = useCallback(() => {
    if (!music) {
      return
    }
    void navigator.clipboard
      .writeText(music.playerId)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        toast.error(t('admin.musics.detail.copyFailed'))
      })
  }, [music, t])

  const deleteMutation = useMutation({
    mutationFn: (musicId: string) => orpc.admin.music.delete({ id: musicId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.music.list.key() })
      toast.success(t('admin.musics.detail.deleted'))
      void navigate('/admin/library/music')
    },
    onError: onMutationError('admin.toast.deleteFailed', t),
  })

  const handleDelete = useCallback(() => {
    if (!music) {
      return
    }
    setConfirm({
      title: t('admin.musics.detail.deleteTitle', { name: music.name }),
      description: t('admin.musics.detail.deleteBody'),
      actionLabel: t('common.action.delete'),
      destructive: true,
      onConfirm: () => {
        deleteMutation.mutate(music.id)
        setConfirm(null)
      },
    })
  }, [music, deleteMutation, t])

  const isMutating = updateMutation.isPending

  if (musicQuery.isLoading) {
    return <DetailSkeleton />
  }

  if (musicQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-ink-4">
        <p className="text-lg">{t('admin.list.loadFailed')}</p>
        <p className="mt-1 text-sm">{musicQuery.error?.message ?? t('admin.list.retryHint')}</p>
        <button
          type="button"
          onClick={() => void navigate('/admin/library/music')}
          className="mt-4 flex size-10 items-center justify-center rounded-full bg-surface-dim text-ink-3 transition-colors hover:bg-surface hover:text-ink-1"
          aria-label={t('admin.musics.detail.back')}
        >
          <X className="size-5" />
        </button>
      </div>
    )
  }

  if (!music) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-ink-4">
        <p className="text-lg">{t('admin.musics.detail.notFound')}</p>
        <button
          type="button"
          onClick={() => void navigate('/admin/library/music')}
          className="mt-4 flex size-10 items-center justify-center rounded-full bg-surface-dim text-ink-3 transition-colors hover:bg-surface hover:text-ink-1"
          aria-label={t('admin.musics.detail.back')}
        >
          <X className="size-5" />
        </button>
      </div>
    )
  }

  return (
    <LazyMotionDiv
      className="relative min-h-full"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transitions.detailFade}
    >
      <button
        type="button"
        onClick={() => void navigate('/admin/library/music')}
        className="absolute top-2 right-0 z-40 flex size-10 items-center justify-center rounded-full bg-surface-dim/80 text-ink-3 backdrop-blur-sm transition-all hover:scale-110 hover:bg-surface hover:text-ink-1 active:scale-95 lg:top-4"
        aria-label={t('common.action.close')}
      >
        <X className="size-5" />
      </button>

      <div
        className={cn(
          '-mx-8 -mt-8 mb-8 px-8 pt-8 pb-8',
          'md:-mx-10 md:-mt-10 md:px-10',
          'lg:-mx-12 lg:-mt-12 lg:px-12 lg:pt-12 lg:pb-12',
        )}
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, var(--surface-dim) 70%, transparent) 0%, transparent 100%)`,
        }}
      >
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
          <LazyMotionDiv
            className="shrink-0"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...transitions.detailFade, delay: 0.05 }}
          >
            {music.coverUrl ? (
              <Image
                src={music.coverUrl}
                alt={music.name}
                width={224}
                height={224}
                className="size-56 rounded-lg object-cover shadow-2xl"
              />
            ) : (
              <div className="size-56 rounded-lg bg-surface-dim shadow-2xl" />
            )}
          </LazyMotionDiv>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <LazyMotionSpan
              className="text-xs font-medium tracking-wider text-ink-4 uppercase"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transitions.detailFade, delay: 0.1 }}
            >
              {t('admin.musics.detail.single')}
            </LazyMotionSpan>

            {editing ? (
              <LazyMotionDiv
                className="flex flex-col gap-3"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={transitions.detailFade}
              >
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={t('admin.musics.detail.songName')}
                  aria-label={t('admin.musics.detail.songName')}
                  className="w-full border-b-2 border-line-muted bg-transparent pb-1 text-4xl font-bold tracking-tight text-ink-1 transition-colors outline-none placeholder:text-ink-4/40 focus:border-primary sm:text-5xl lg:text-6xl"
                />
                <div className="flex flex-wrap items-center gap-2 text-base text-ink-2">
                  <input
                    type="text"
                    value={draftArtist}
                    onChange={(e) => setDraftArtist(e.target.value)}
                    placeholder={t('admin.musics.detail.artistPlaceholder')}
                    aria-label={t('admin.musics.detail.artist')}
                    className="min-w-0 flex-1 border-b-2 border-line-muted bg-transparent pb-1 transition-colors outline-none placeholder:text-ink-4/40 focus:border-primary"
                  />
                  <span className="text-ink-4">·</span>
                  <input
                    type="text"
                    value={draftAlbum}
                    onChange={(e) => setDraftAlbum(e.target.value)}
                    placeholder={t('admin.musics.detail.album')}
                    aria-label={t('admin.musics.detail.album')}
                    className="min-w-0 flex-1 border-b-2 border-line-muted bg-transparent pb-1 transition-colors outline-none placeholder:text-ink-4/40 focus:border-primary"
                  />
                </div>
              </LazyMotionDiv>
            ) : (
              <>
                <LazyMotionH1
                  className="text-4xl font-bold tracking-tight text-ink-1 sm:text-5xl lg:text-6xl"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transitions.detailFade, delay: 0.15 }}
                >
                  {music.name}
                </LazyMotionH1>
                <LazyMotionP
                  className="text-base text-ink-2"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transitions.detailFade, delay: 0.2 }}
                >
                  {music.artist.join(' / ')} · {music.album}
                </LazyMotionP>
              </>
            )}
            <LazyMotionP
              className="text-sm text-ink-4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transitions.detailFade, delay: 0.25 }}
            >
              {music.source} · {music.uploaderName ?? '—'} · {formatLocalDate(music.createdAt, DATE_FORMAT, config)}
            </LazyMotionP>
          </div>
        </div>
      </div>

      <LazyMotionDiv
        className="mb-8 flex items-center gap-3"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.detailFade, delay: 0.3 }}
      >
        {!editing && (
          <>
            <button
              type="button"
              onClick={handlePlay}
              className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
              aria-label={isCurrentPlaying ? t('music.pause') : t('music.play')}
            >
              {isCurrentPlaying ? <Pause className="size-7 fill-current" /> : <Play className="size-7 fill-current" />}
            </button>

            <button
              type="button"
              onClick={handleCopyId}
              className="flex items-center gap-2 rounded-full bg-surface-dim px-4 py-2 text-sm text-ink-1 transition-colors hover:bg-surface"
            >
              <Copy className="size-4" />
              {copied ? t('admin.musics.detail.copied') : t('admin.musics.detail.copyId')}
            </button>

            <button
              type="button"
              onClick={enterEdit}
              className="flex items-center gap-2 rounded-full bg-surface-dim px-4 py-2 text-sm text-ink-1 transition-colors hover:bg-surface"
            >
              <Pencil className="size-4" />
              {t('common.action.edit')}
            </button>

            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-ink-4 transition-colors hover:bg-surface-dim hover:text-red-400"
            >
              <Trash2 className="size-4" />
              {t('common.action.delete')}
            </button>
          </>
        )}

        {editing && (
          <>
            <button
              type="button"
              onClick={saveEdit}
              disabled={isMutating}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50"
            >
              <Check className="size-4" />
              {isMutating ? t('admin.musics.detail.saving') : t('common.action.save')}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isMutating}
              className="flex items-center gap-2 rounded-full bg-surface-dim px-4 py-2.5 text-sm text-ink-1 transition-colors hover:bg-surface"
            >
              <RotateCcw className="size-4" />
              {t('common.action.cancel')}
            </button>
          </>
        )}
      </LazyMotionDiv>

      {!editing && (
        <LazyMotionDiv
          className="mb-8 grid grid-cols-2 gap-4 text-sm text-ink-4 sm:grid-cols-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transitions.detailFade, delay: 0.35 }}
        >
          <div>
            <span className="block text-xs text-ink-4/70">playerId</span>
            <span className="font-mono">{music.playerId}</span>
          </div>
          <div>
            <span className="block text-xs text-ink-4/70">sourceId</span>
            <span className="font-mono">{music.sourceId}</span>
          </div>
          <div>
            <span className="block text-xs text-ink-4/70">{t('admin.musics.detail.uploader')}</span>
            <span>{music.uploaderName ?? '—'}</span>
          </div>
          <div>
            <span className="block text-xs text-ink-4/70">{t('admin.musics.detail.updated')}</span>
            <span>{formatLocalDate(music.updatedAt, DATE_FORMAT, config)}</span>
          </div>
        </LazyMotionDiv>
      )}

      <LazyMotionDiv
        className="border-t border-line pt-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.detailFade, delay: 0.4 }}
      >
        <h2 className="mb-6 text-xl font-bold text-ink-1">{t('admin.musics.detail.lyrics')}</h2>
        {editing ? (
          <textarea
            value={draftLyric}
            onChange={(e) => setDraftLyric(e.target.value)}
            placeholder={t('admin.musics.detail.lyricsPlaceholder')}
            aria-label={t('admin.musics.detail.lyrics')}
            className="h-96 w-full resize-y rounded-xl bg-surface-dim p-5 font-mono text-sm leading-relaxed text-ink-1 ring-1 ring-line-muted transition-shadow outline-none placeholder:text-ink-4/40 focus:ring-2 focus:ring-primary/30"
          />
        ) : (
          <LyricsDisplay lrcText={music.lyric} currentTime={isCurrent ? currentTime : 0} />
        )}
      </LazyMotionDiv>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </LazyMotionDiv>
  )
}

function DetailSkeleton() {
  return (
    <div className="relative min-h-full animate-pulse">
      <div className="absolute top-2 right-0 z-40 size-10 rounded-full bg-surface-dim lg:top-4" />
      <div className="mb-8 flex flex-col items-start gap-6 sm:flex-row sm:items-end">
        <div className="size-56 rounded-lg bg-surface-dim" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-12 rounded bg-surface-dim" />
          <div className="h-16 w-64 rounded bg-surface-dim" />
          <div className="h-5 w-48 rounded bg-surface-dim" />
          <div className="h-4 w-32 rounded bg-surface-dim" />
        </div>
      </div>
      <div className="mb-8 flex gap-4">
        <div className="size-14 rounded-full bg-surface-dim" />
        <div className="h-10 w-24 rounded-full bg-surface-dim" />
      </div>
    </div>
  )
}
