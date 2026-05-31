import { SaveIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { AdminMusicDto, UpdateMusicInput } from '@/shared/types/music'

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
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'

// Discriminator: `music === undefined` keeps the dialog closed; a
// populated `music` opens it in "edit existing" mode. The parent
// owns the state — closing the dialog flips this back to
// `undefined` so the close animation does not blank the fields.
//
// Audio / cover bytes and the provider id triplet (source,
// sourceId, playerId) are intentionally read-only here: those are
// owned by the upload pipeline and are how MDX references the row
// (`<MusicPlayer id="..." />`). Editing them would silently break
// every post that already cites the song.
export interface EditMusicDialogProps {
  music: AdminMusicDto | undefined
  onClose: () => void
  onSaved: (music: AdminMusicDto) => void
}

interface MusicDraft {
  name: string
  /** UI keeps `artist` as a single textarea; split on `/` on submit. */
  artist: string
  album: string
  lyric: string
}

const EMPTY_DRAFT: MusicDraft = { name: '', artist: '', album: '', lyric: '' }

export function EditMusicDialog({ music, onClose, onSaved }: EditMusicDialogProps) {
  const [draft, setDraft] = useState<MusicDraft>(EMPTY_DRAFT)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const updateMutation = useMutation({
    ...orpcQuery.admin.music.update.mutationOptions(),
    onSuccess: (payload) => {
      toast.success('音乐已更新')
      setErrorMessage(null)
      onSaved(payload.music)
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })
  const { mutate: submit, isPending } = updateMutation

  useEffect(() => {
    if (music === undefined) {
      return
    }
    setErrorMessage(null)
    setDraft({
      name: music.name,
      artist: music.artist.join(' / '),
      album: music.album,
      lyric: music.lyric ?? '',
    })
  }, [music])

  const open = music !== undefined

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑音乐元数据</DialogTitle>
          <DialogDescription>
            仅修改展示字段；source / sourceId / playerId 与音频、封面文件由上传管线管理，无法在此编辑。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (music === undefined) {
              return
            }
            const artistList = draft.artist
              .split('/')
              .map((part) => part.trim())
              .filter((part) => part !== '')
            if (artistList.length === 0) {
              setErrorMessage('至少填写一位歌手（多位用 / 分隔）')
              return
            }
            const payload: UpdateMusicInput = {
              id: music.id,
              name: draft.name.trim(),
              artist: artistList,
              album: draft.album.trim(),
              lyric: draft.lyric,
            }
            submit(payload)
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          {music ? (
            <div className="grid grid-cols-[80px_1fr] items-center gap-3 sm:col-span-2">
              {music.coverUrl !== '' ? (
                <>
                  {/* Admin preview thumbnail: the cover is already a small public S3 URL
                      and does not need CDN transform for an 80×80 dialog preview. */}
                  <img src={music.coverUrl} alt="" className="size-20 rounded-xl object-cover" loading="lazy" />
                </>
              ) : (
                <div className="size-20 rounded-xl bg-muted" />
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <dt>player_id</dt>
                <dd className="font-mono">{music.playerId}</dd>
                <dt>source</dt>
                <dd>
                  {music.source} / <span className="font-mono">{music.sourceId}</span>
                </dd>
                <dt>上传者</dt>
                <dd>{music.uploaderName ?? '—'}</dd>
              </dl>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="music-name">歌名</Label>
            <Input
              id="music-name"
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              maxLength={200}
              required
            />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="music-artist">歌手</Label>
            <Input
              id="music-artist"
              type="text"
              value={draft.artist}
              onChange={(e) => setDraft((prev) => ({ ...prev, artist: e.target.value }))}
              placeholder="多位歌手用 / 分隔"
              required
            />
            <p className="text-xs text-muted-foreground">例：周杰伦 / 杨瑞代</p>
          </div>

          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="music-album">专辑</Label>
            <Input
              id="music-album"
              type="text"
              value={draft.album}
              onChange={(e) => setDraft((prev) => ({ ...prev, album: e.target.value }))}
              maxLength={200}
              placeholder="可选"
            />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="music-lyric">歌词 (LRC)</Label>
            <Textarea
              id="music-lyric"
              value={draft.lyric}
              onChange={(e) => setDraft((prev) => ({ ...prev, lyric: e.target.value }))}
              rows={10}
              spellCheck={false}
              className="max-h-72 min-h-32 overflow-y-auto font-mono text-xs"
              placeholder={'[00:12.34]第一行歌词\n[00:18.20]第二行歌词\n…'}
            />
            <p className="text-xs text-muted-foreground">留空则清除已存的歌词；保存后 APlayer 将使用新内容。</p>
          </div>

          {errorMessage ? <p className="text-sm text-destructive sm:col-span-2">{errorMessage}</p> : null}

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <XIcon /> 取消
            </Button>
            <Button type="submit" disabled={isPending}>
              <SaveIcon /> {isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
