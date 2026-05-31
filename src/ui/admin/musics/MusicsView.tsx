import {
  CopyIcon,
  MusicIcon,
  SquarePenIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminMusicDto } from '@/shared/types/music'

import { orpc } from '@/client/api/client'
import { orpcQuery, useMutation, useQuery } from '@/client/api/query'
import { AddMusicDialog } from '@/ui/admin/musics/AddMusicDialog'
import { EditMusicDialog } from '@/ui/admin/musics/EditMusicDialog'
import { FloatingMusicPlayer, type FloatingMusicPlayerTrack } from '@/ui/admin/musics/FloatingMusicPlayer'
import { useMusicsController } from '@/ui/admin/musics/useMusicsController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/components/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Skeleton } from '@/ui/components/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'
import { cn } from '@/ui/lib/cn'

const PAGE_SIZE_OPTIONS: { value: string; label: string }[] = [10, 20, 50, 100].map((n) => ({
  value: String(n),
  label: `${n} 条`,
}))

// Music admin page orchestrator. The list table omits the `source`
// column on purpose — every row is `netease` for now (see plan §10),
// so showing it would just add noise. `playerId` is what the admin
// pastes into MDX as `<MusicPlayer id="..." />`, so the table makes
// it easy to copy.
export function MusicsView() {
  const { state, dispatch } = useMusicsController()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminMusicDto | undefined>(undefined)
  const [copiedPlayerId, setCopiedPlayerId] = useState<string | null>(null)
  const [playingTrack, setPlayingTrack] = useState<FloatingMusicPlayerTrack | null>(null)

  const listQuery = useQuery(
    orpcQuery.admin.music.list.queryOptions({
      input: {
        q: state.q || undefined,
        offset: state.currentPage * state.pageSize,
        limit: state.pageSize,
      },
    }),
  )

  useEffect(() => {
    if (listQuery.data) {
      dispatch({
        type: 'loaded',
        rows: listQuery.data.musics,
        total: listQuery.data.total,
        hasMore: listQuery.data.hasMore,
      })
    }
  }, [listQuery.data, dispatch])

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载音乐列表失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

  const isListPending = listQuery.isFetching

  const reload = useCallback(() => {
    void listQuery.refetch()
  }, [listQuery])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orpc.admin.music.delete({ id }),
    onSuccess: () => undefined,
    onError: (error) => {
      toast.error('操作失败', { description: error.message })
      setConfirm({
        title: '删除失败',
        description: error.message,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })
  const { mutate: submitDelete } = deleteMutation

  const [qInput, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: (value) => dispatch({ type: 'setQ', value }),
  })

  const isLoading = isListPending && state.rows.length === 0
  const totalPages = useMemo(() => Math.max(1, Math.ceil(state.total / state.pageSize)), [state.total, state.pageSize])

  const onCopyPlayerId = useCallback((music: AdminMusicDto) => {
    void navigator.clipboard.writeText(music.playerId).then(() => {
      setCopiedPlayerId(music.playerId)
      setTimeout(() => {
        setCopiedPlayerId((prev) => (prev === music.playerId ? null : prev))
      }, 1500)
    })
  }, [])

  const onDelete = useCallback(
    (music: AdminMusicDto) => {
      setConfirm({
        title: `删除音乐「${music.name}」？`,
        description: '此操作会从 S3 移除音频与封面对象，并把元数据标记为软删除。引用该音乐的页面将无法播放。',
        actionLabel: '删除',
        destructive: true,
        onConfirm: () => {
          dispatch({ type: 'removeMusic', id: music.id })
          submitDelete(music.id)
        },
      })
    },
    [dispatch, submitDelete],
  )

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title="音乐管理"
          description={`共 ${state.total} 条。当前仅支持 NetEase；可在右侧浮动播放器试听，可编辑歌名、歌手、专辑、歌词等元数据，删除时同步移除 S3 中的音频与封面对象。`}
        >
          <Button type="button" variant="outline" className="border-ink-4" onClick={reload} disabled={isListPending}>
            <RefreshCwIcon /> 刷新
          </Button>
          <Button type="button" onClick={() => setAddDialogOpen(true)}>
            <PlusIcon /> 添加音乐
          </Button>
        </AdminListPage.Header>

        <AdminListPage.Toolbar>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-3">
              <AdminListPage.FilterField label="搜索（歌名 / 歌手 / 专辑 / sourceId / playerId）">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    value={qInput}
                    onChange={(event) => setQInput(event.target.value)}
                    placeholder="输入歌名、歌手或 ID 关键字"
                  />
                </InputGroup>
              </AdminListPage.FilterField>
            </div>
            <AdminListPage.FilterField label="每页显示">
              <Select
                items={PAGE_SIZE_OPTIONS}
                value={String(state.pageSize)}
                onValueChange={(value) => dispatch({ type: 'setPageSize', value: Number.parseInt(value ?? '10', 10) })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminListPage.FilterField>
          </div>
        </AdminListPage.Toolbar>

        <AdminListPage.Body>
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 pl-4">封面</TableHead>
                  <TableHead>歌曲</TableHead>
                  <TableHead className="hidden md:table-cell">专辑</TableHead>
                  <TableHead className="hidden w-44 lg:table-cell">player_id</TableHead>
                  <TableHead className="hidden w-32 lg:table-cell">source_id</TableHead>
                  <TableHead className="hidden w-28 xl:table-cell">上传者</TableHead>
                  <TableHead className="hidden w-28 xl:table-cell">时间</TableHead>
                  <TableHead className="w-36 pr-4 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <MusicsTableSkeleton />
                ) : state.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <Empty className="border-0">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <MusicIcon />
                          </EmptyMedia>
                          <EmptyTitle>未找到音乐</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  state.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="pl-4">
                        {row.coverUrl !== '' ? (
                          <>
                            {/* Admin table thumbnail: the cover is already a public S3 URL
                                and does not need CDN transform for a 40×40 list preview. */}
                            <img src={row.coverUrl} alt="" className="size-10 rounded object-cover" loading="lazy" />
                          </>
                        ) : (
                          <div className="size-10 rounded bg-muted" />
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.artist.join(' / ')}</p>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{row.album}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onCopyPlayerId(row)}
                          className="h-7 font-mono text-xs"
                        >
                          {copiedPlayerId === row.playerId ? '已复制' : row.playerId}
                          <CopyIcon />
                        </Button>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                        {row.sourceId}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                        {row.uploaderName ?? '—'}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                        {formatShortDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setPlayingTrack({
                              playerId: row.playerId,
                              name: row.name,
                              artist: row.artist,
                              coverUrl: row.coverUrl,
                            })
                          }
                          aria-label={`播放「${row.name}」`}
                          aria-pressed={playingTrack?.playerId === row.playerId}
                          className={cn(
                            playingTrack?.playerId === row.playerId &&
                              'text-primary hover:text-primary focus-visible:text-primary',
                          )}
                        >
                          <PlayIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditTarget(row)}
                          aria-label={`编辑「${row.name}」`}
                        >
                          <SquarePenIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(row)}
                          aria-label={`删除「${row.name}」`}
                        >
                          <Trash2Icon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </AdminListPage.Body>

        <AdminListPage.PageNavigation
          totalPages={totalPages}
          currentPage={state.currentPage}
          onChange={(page) => dispatch({ type: 'setCurrentPage', value: page })}
        />
      </AdminListPage>

      <AddMusicDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdded={(music) => dispatch({ type: 'prependMusic', music })}
      />

      <EditMusicDialog
        music={editTarget}
        onClose={() => setEditTarget(undefined)}
        onSaved={(saved) => {
          dispatch({ type: 'patchMusic', music: saved })
          setEditTarget(undefined)
        }}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      {playingTrack !== null ? (
        // `key` forces a remount whenever the operator picks a
        // different track. APlayer mutates the container DOM
        // extensively; remounting (which re-runs the init effect with
        // a fresh container) is the cleanest way to swap audio
        // without reaching into APlayer's mutable state.
        <FloatingMusicPlayer key={playingTrack.playerId} track={playingTrack} onClose={() => setPlayingTrack(null)} />
      ) : null}
    </>
  )
}

function MusicsTableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        // Skeleton rows — identical placeholders, swapped wholesale on load.
        // oxlint-disable-next-line react/no-array-index-key
        <TableRow key={index}>
          <TableCell className="pl-4">
            <Skeleton className="size-10 rounded" />
          </TableCell>
          <TableCell>
            <Skeleton className="mb-1 h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell className="hidden lg:table-cell">
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell className="hidden lg:table-cell">
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell className="hidden xl:table-cell">
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell className="hidden xl:table-cell">
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell className="pr-4" />
        </TableRow>
      ))}
    </>
  )
}

function formatShortDate(iso: string): string {
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
