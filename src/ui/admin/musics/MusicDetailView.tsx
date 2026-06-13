import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Pause, Trash2, X, Copy, Pencil, Check, RotateCcw } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { transitions } from '@/client/lib/motion'
import { LyricsDisplay } from '@/ui/admin/musics/LyricsDisplay'
import { useMusicPlayerActions, useMusicPlayerState, useMusicPlayerTime } from '@/ui/admin/musics/MusicPlayerContext'
import { ConfirmDialog, type ConfirmState } from '@/ui/admin/shared/ConfirmDialog'
import { cn } from '@/ui/lib/cn'
import { Image } from '@/ui/public/widgets/Image'

export function MusicDetailView() {
  const params = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { load, toggle } = useMusicPlayerActions()
  const { currentTrack, isPlaying } = useMusicPlayerState()
  const currentTime = useMusicPlayerTime()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)

  const id = params.id ?? ''

  // Reset editing state when navigating between different songs
  useEffect(() => {
    setEditing(false)
    setConfirm(null)
    setCopied(false)
  }, [id])

  const musicQuery = useQuery(
    orpcQuery.admin.music.get.queryOptions({
      input: { id },
      enabled: id !== '',
    }),
  )

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
      void queryClient.invalidateQueries({ queryKey: ['admin', 'music', 'list'] })
      toast.success('已保存')
      setEditing(false)
    },
    onError: (error) => {
      toast.error(error.message || '保存失败')
    },
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
    const artistArr = draftArtist
      .split('/')
      .map((a) => a.trim())
      .filter((a) => a !== '')
    updateMutation.mutate({
      id: music.id,
      name: draftName.trim() || music.name,
      artist: artistArr.length > 0 ? artistArr : music.artist,
      album: draftAlbum.trim() || music.album,
      lyric: draftLyric?.trim() || undefined,
    })
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
        toast.error('复制失败')
      })
  }, [music])

  const deleteMutation = useMutation({
    mutationFn: (musicId: string) => orpc.admin.music.delete({ id: musicId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'music', 'list'] })
      toast.success('已删除')
      void navigate('/admin/library/music')
    },
    onError: (error) => {
      toast.error(error.message || '删除失败')
    },
  })

  const handleDelete = useCallback(() => {
    if (!music) {
      return
    }
    setConfirm({
      title: `删除音乐「${music.name}」？`,
      description: '此操作会从 S3 移除音频与封面对象，并把元数据标记为软删除。引用该音乐的页面将无法播放。',
      actionLabel: '删除',
      destructive: true,
      onConfirm: () => {
        deleteMutation.mutate(music.id)
        setConfirm(null)
      },
    })
  }, [music, deleteMutation])

  const isMutating = updateMutation.isPending

  if (musicQuery.isLoading) {
    return <DetailSkeleton />
  }

  if (musicQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-ink-4">
        <p className="text-lg">加载失败</p>
        <p className="mt-1 text-sm">{musicQuery.error?.message ?? '请稍后重试'}</p>
        <button
          type="button"
          onClick={() => void navigate('/admin/library/music')}
          className="mt-4 flex size-10 items-center justify-center rounded-full bg-surface-dim text-ink-3 transition-colors hover:bg-surface hover:text-ink-1"
          aria-label="返回"
        >
          <X className="size-5" />
        </button>
      </div>
    )
  }

  if (!music) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-ink-4">
        <p className="text-lg">未找到该歌曲</p>
        <button
          type="button"
          onClick={() => void navigate('/admin/library/music')}
          className="mt-4 flex size-10 items-center justify-center rounded-full bg-surface-dim text-ink-3 transition-colors hover:bg-surface hover:text-ink-1"
          aria-label="返回"
        >
          <X className="size-5" />
        </button>
      </div>
    )
  }

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
        onClick={() => void navigate('/admin/library/music')}
        className="absolute top-2 right-0 z-40 flex size-10 items-center justify-center rounded-full bg-surface-dim/80 text-ink-3 backdrop-blur-sm transition-all hover:scale-110 hover:bg-surface hover:text-ink-1 active:scale-95 lg:top-4"
        aria-label="关闭"
      >
        <X className="size-5" />
      </button>

      {/* Hero */}
      <div
        className={cn('-mx-4 -mt-4 mb-8 px-4 pt-8 pb-8 lg:-mx-6 lg:-mt-6 lg:px-6 lg:pt-12 lg:pb-12')}
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, var(--surface-dim) 70%, transparent) 0%, transparent 100%)`,
        }}
      >
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
          {/* Cover */}
          <motion.div
            className="shrink-0"
            style={{ viewTransitionName: `music-cover-${music.id}` }}
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
          </motion.div>

          {/* Info / Edit Form */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <motion.span
              className="text-xs font-medium tracking-wider text-ink-4 uppercase"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transitions.detailFade, delay: 0.1 }}
            >
              单曲
            </motion.span>

            {editing ? (
              <motion.div
                className="flex flex-col gap-3"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={transitions.detailFade}
              >
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="歌曲名称"
                  aria-label="歌曲名称"
                  className="w-full border-b-2 border-line-muted bg-transparent pb-1 text-4xl font-black tracking-tight text-ink-1 transition-colors outline-none placeholder:text-ink-4/40 focus:border-primary sm:text-5xl lg:text-6xl"
                />
                <div className="flex flex-wrap items-center gap-2 text-base text-ink-2">
                  <input
                    type="text"
                    value={draftArtist}
                    onChange={(e) => setDraftArtist(e.target.value)}
                    placeholder="艺人（用 / 分隔）"
                    aria-label="艺人"
                    className="min-w-0 flex-1 border-b-2 border-line-muted bg-transparent pb-1 transition-colors outline-none placeholder:text-ink-4/40 focus:border-primary"
                  />
                  <span className="text-ink-4">·</span>
                  <input
                    type="text"
                    value={draftAlbum}
                    onChange={(e) => setDraftAlbum(e.target.value)}
                    placeholder="专辑"
                    aria-label="专辑"
                    className="min-w-0 flex-1 border-b-2 border-line-muted bg-transparent pb-1 transition-colors outline-none placeholder:text-ink-4/40 focus:border-primary"
                  />
                </div>
              </motion.div>
            ) : (
              <>
                <motion.h1
                  className="text-4xl font-black tracking-tight text-ink-1 sm:text-5xl lg:text-6xl"
                  style={{ viewTransitionName: `music-title-${music.id}` }}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transitions.detailFade, delay: 0.15 }}
                >
                  {music.name}
                </motion.h1>
                <motion.p
                  className="text-base text-ink-2"
                  style={{ viewTransitionName: `music-artist-${music.id}` }}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transitions.detailFade, delay: 0.2 }}
                >
                  {music.artist.join(' / ')} · {music.album}
                </motion.p>
              </>
            )}
            <motion.p
              className="text-sm text-ink-4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transitions.detailFade, delay: 0.25 }}
            >
              {music.source} · {music.uploaderName ?? '—'} · {formatDate(music.createdAt)}
            </motion.p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <motion.div
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
              aria-label={isCurrentPlaying ? '暂停' : '播放'}
            >
              {isCurrentPlaying ? <Pause className="size-7 fill-current" /> : <Play className="size-7 fill-current" />}
            </button>

            <button
              type="button"
              onClick={handleCopyId}
              className="flex items-center gap-2 rounded-full bg-surface-dim px-4 py-2 text-sm text-ink-1 transition-colors hover:bg-surface"
            >
              <Copy className="size-4" />
              {copied ? '已复制' : '复制 playerId'}
            </button>

            <button
              type="button"
              onClick={enterEdit}
              className="flex items-center gap-2 rounded-full bg-surface-dim px-4 py-2 text-sm text-ink-1 transition-colors hover:bg-surface"
            >
              <Pencil className="size-4" />
              编辑
            </button>

            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-ink-4 transition-colors hover:bg-surface-dim hover:text-red-400"
            >
              <Trash2 className="size-4" />
              删除
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
              {isMutating ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isMutating}
              className="flex items-center gap-2 rounded-full bg-surface-dim px-4 py-2.5 text-sm text-ink-1 transition-colors hover:bg-surface"
            >
              <RotateCcw className="size-4" />
              取消
            </button>
          </>
        )}
      </motion.div>

      {/* Metadata */}
      {!editing && (
        <motion.div
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
            <span className="block text-xs text-ink-4/70">上传者</span>
            <span>{music.uploaderName ?? '—'}</span>
          </div>
          <div>
            <span className="block text-xs text-ink-4/70">更新时间</span>
            <span>{formatDate(music.updatedAt)}</span>
          </div>
        </motion.div>
      )}

      {/* Lyrics */}
      <motion.div
        className="border-t border-line pt-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.detailFade, delay: 0.4 }}
      >
        <h2 className="mb-6 text-xl font-bold text-ink-1">歌词</h2>
        {editing ? (
          <textarea
            value={draftLyric}
            onChange={(e) => setDraftLyric(e.target.value)}
            placeholder="在此粘贴 LRC 格式歌词…"
            aria-label="歌词"
            className="h-96 w-full resize-y rounded-xl bg-surface-dim p-5 font-mono text-sm leading-relaxed text-ink-1 ring-1 ring-line-muted transition-shadow outline-none placeholder:text-ink-4/40 focus:ring-2 focus:ring-primary/30"
          />
        ) : (
          <LyricsDisplay lrcText={music.lyric} currentTime={isCurrent ? currentTime : 0} />
        )}
      </motion.div>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </motion.div>
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

function formatDate(iso: string): string {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) {
      return '—'
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  } catch {
    return '—'
  }
}
