import { useQuery } from '@tanstack/react-query'
import { Music2Icon, PlusIcon, SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { AdminMusicDto } from '@/shared/types/music'

import { orpcQuery } from '@/client/api/orpc-query'
import { AddMusicDialog } from '@/ui/admin/musics/AddMusicDialog'
import { Button } from '@/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'

// Music picker. Pulls from the local admin library, with an inline
// `/admin/library/music`. Newly added tracks are prepended to the picker
// list so the operator can pick them straight into the article without
// leaving the editor — `addMusic` already downloads the audio + cover
// to S3 and inserts the row before resolving.

export interface MusicPickerDialogProps {
  trigger?: React.ReactNode
  onPick: (music: AdminMusicDto) => void
  /**
   * Optional controlled-open pair. Pass when the caller wants to
   * drive the dialog imperatively (e.g. a slash-command in the
   * editor) instead of relying on a `trigger` button click.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function MusicPickerDialog({ trigger, onPick, open: openProp, onOpenChange }: MusicPickerDialogProps) {
  const [openInternal, setOpenInternal] = useState(false)
  const open = openProp ?? openInternal
  const setOpen = (next: boolean) => {
    if (openProp === undefined) {
      setOpenInternal(next)
    }
    onOpenChange?.(next)
  }
  const [q, setQ] = useState('')
  const [musics, setMusics] = useState<AdminMusicDto[] | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const listQuery = useQuery(
    orpcQuery.admin.music.list.queryOptions({
      input: { q: q.trim() === '' ? undefined : q.trim(), limit: 60 },
      enabled: false,
    }),
  )

  useEffect(() => {
    if (listQuery.data) {
      setMusics(listQuery.data.musics)
    }
  }, [listQuery.data])

  const lastFetchedQRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      lastFetchedQRef.current = null
      return
    }
    const trimmed = q.trim()
    if (lastFetchedQRef.current === trimmed) {
      return
    }
    const handle = setTimeout(
      () => {
        lastFetchedQRef.current = trimmed
        setMusics(null)
        void listQuery.refetch()
      },
      lastFetchedQRef.current === null ? 0 : 300,
    )
    return () => clearTimeout(handle)
  }, [q, open, listQuery])

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {openProp === undefined ? (
          <DialogTrigger
            render={
              trigger !== undefined ? (
                (trigger as React.ReactElement)
              ) : (
                <Button variant="outline" type="button">
                  <Music2Icon /> 选择音乐
                </Button>
              )
            }
          />
        ) : null}
        <DialogContent className="max-h-dialog-max-h max-w-2xl">
          <DialogHeader>
            <DialogTitle>选择音乐</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <SearchIcon className="size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="按曲名 / 演唱者搜索"
              className="max-w-md"
            />
            <div className="flex-1" />
            <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <PlusIcon /> 添加音乐
            </Button>
          </div>
          <div className="max-h-dialog-max-h-sm overflow-y-auto">
            {musics === null ? (
              <div className="p-8 text-center text-sm text-muted-foreground">加载中…</div>
            ) : musics.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
                <p>没有匹配的音乐。</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <PlusIcon /> 通过 NetEase 搜索并添加
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {musics.map((music) => (
                  <MusicRow
                    key={music.id}
                    music={music}
                    onClick={() => {
                      onPick(music)
                      setOpen(false)
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AddMusicDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={(music) => {
          // Prepend the freshly-added row so the operator can pick it
          // immediately. We don't auto-pick so multi-add still works
          // (matches `MusicsView` behaviour where the dialog stays open
          // after each successful add).
          setMusics((prev) => {
            const next = prev === null ? [] : prev.filter((m) => m.id !== music.id)
            return [music, ...next]
          })
        }}
      />
    </>
  )
}

interface MusicRowProps {
  music: AdminMusicDto
  onClick: () => void
}

function MusicRow({ music, onClick }: MusicRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl border bg-card p-2 text-left transition hover:border-primary"
      >
        <img
          src={music.coverUrl}
          alt={music.name}
          loading="lazy"
          decoding="async"
          className="size-12 shrink-0 rounded object-cover"
        />
        <div className="grow truncate">
          <div className="truncate text-sm font-medium">{music.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {music.artist.join(', ')} · {music.album}
          </div>
        </div>
        <code className="font-mono text-badge text-muted-foreground">{music.playerId}</code>
      </button>
    </li>
  )
}
