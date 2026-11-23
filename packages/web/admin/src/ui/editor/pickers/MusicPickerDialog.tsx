import type { AdminMusicDto, ListMusicOutput } from '@kobato/api/contracts/admin/music'

import { Button } from '@kobato/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@kobato/ui/components/dialog'
import { Input } from '@kobato/ui/components/input'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useDebouncedSearch } from '@kobato/ui/lib/use-debounced-search'
import { AddMusicDialog } from '@kobato/web-admin/ui/music/AddMusicDialog'
import { orpcQuery } from '@kobato/web-client/api/orpc-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Music2Icon, PlusIcon, SearchIcon } from 'lucide-react'
import { isValidElement, useState } from 'react'

export interface MusicPickerDialogProps {
  trigger?: React.ReactNode
  onPick: (music: AdminMusicDto) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function MusicPickerDialog({ trigger, onPick, open: openProp, onOpenChange }: MusicPickerDialogProps) {
  const { t } = useI18n()
  const [openInternal, setOpenInternal] = useState(false)
  const open = openProp ?? openInternal
  const setOpen = (next: boolean) => {
    if (openProp === undefined) {
      setOpenInternal(next)
    }
    onOpenChange?.(next)
  }
  const [q, setQ] = useState('')
  const [qInput, setQInput] = useDebouncedSearch({ onChange: setQ })
  const [addOpen, setAddOpen] = useState(false)
  const queryClient = useQueryClient()

  const listInput = { q: q.trim() === '' ? undefined : q.trim(), limit: 60 }
  const listQuery = useQuery(orpcQuery.admin.music.list.queryOptions({ input: listInput, enabled: open }))
  const musics = listQuery.data?.musics ?? null

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {openProp === undefined ? (
          <DialogTrigger
            render={
              trigger !== undefined && isValidElement(trigger) ? (
                trigger
              ) : (
                <Button variant="outline" type="button">
                  <Music2Icon /> {t('admin.editor.musicPicker.choose')}
                </Button>
              )
            }
          />
        ) : null}
        <DialogContent className="max-h-dialog-max-h max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('admin.editor.musicPicker.title')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <SearchIcon className="size-4 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={t('admin.editor.musicPicker.search')}
              className="max-w-md"
            />
            <div className="flex-1" />
            <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <PlusIcon /> {t('admin.musics.add')}
            </Button>
          </div>
          <div className="max-h-dialog-max-h-sm overflow-y-auto">
            {musics === null ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{t('common.state.loading')}</div>
            ) : musics.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
                <p>{t('admin.editor.musicPicker.empty')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <PlusIcon /> {t('admin.editor.musicPicker.searchHint')}
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
          queryClient.setQueryData(
            orpcQuery.admin.music.list.key({ input: { q: q.trim() === '' ? undefined : q.trim(), limit: 60 } }),
            (old: ListMusicOutput | undefined): ListMusicOutput | undefined => {
              if (old === undefined) {
                return old
              }
              const isNewRow = old.musics.every((row) => row.id !== music.id)
              return {
                ...old,
                musics: [music, ...old.musics.filter((row) => row.id !== music.id)],
                total: isNewRow ? old.total + 1 : old.total,
              }
            },
          )
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
