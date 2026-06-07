import { useMutation, useQuery } from '@tanstack/react-query'
import { ImageOffIcon, PlusIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminImageDto, AdminImageKind } from '@/shared/types/images'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { ImageCard } from '@/ui/admin/images/ImageCard'
import { ImageDetailDialog } from '@/ui/admin/images/ImageDetailDialog'
import { useImagesController } from '@/ui/admin/images/useImagesController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { UploadImageDialog } from '@/ui/admin/shared/UploadImageDialog'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/components/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Skeleton } from '@/ui/components/skeleton'

// Grid mode shows pure square thumbnails — far more rows fit per page
// than the old table layout, so the page-size options stay generous.
// The default is 30 which still loads quickly because each thumb is
// downsampled to 300×300 through the configured image transform.
const PAGE_SIZE_OPTIONS: { value: string; label: string }[] = [30, 60, 120].map((n) => ({
  value: String(n),
  label: `${n} 张`,
}))

const KIND_OPTIONS: { value: AdminImageKind | 'all'; label: string }[] = [
  { value: 'all', label: '全部用途' },
  { value: 'generic', label: '普通图片' },
  { value: 'category', label: '分类封面' },
  { value: 'friend', label: '友链海报' },
]

// Image library admin page orchestrator. Owns fetcher state, the
// detail-dialog selection, and the confirm-dialog reducer. Per-card
// presentation lives in `./ImageCard.tsx` (memoized so a state tick
// on one card doesn't reconcile every other card). Per-image meta
// + note edit + URL copy live in `./ImageDetailDialog.tsx`, opened
// when the operator clicks a card.
export function ImagesView() {
  const { state, dispatch } = useImagesController()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<AdminImageDto | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const listQuery = useQuery(
    orpcQuery.admin.images.list.queryOptions({
      input: {
        q: state.q || undefined,
        kind: state.kind === 'all' ? undefined : state.kind,
        offset: state.currentPage * state.pageSize,
        limit: state.pageSize,
      },
    }),
  )

  useEffect(() => {
    if (listQuery.data) {
      dispatch({
        type: 'loaded',
        rows: listQuery.data.images,
        total: listQuery.data.total,
        hasMore: listQuery.data.hasMore,
      })
    }
  }, [listQuery.data, dispatch])

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载图片列表失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

  const isListPending = listQuery.isFetching
  const reload = useCallback(() => {
    void listQuery.refetch()
  }, [listQuery])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orpc.admin.images.delete({ id }),
    onSuccess: () => {
      toast.success('删除成功')
    },
    onError: (error) => {
      toast.error('删除图片失败', { description: error.message })
    },
  })
  const submitDelete = deleteMutation.mutate

  const updateNoteMutation = useMutation({
    mutationFn: (vars: { id: string; note: string | null }) =>
      orpc.admin.images.updateNote({ id: vars.id, note: vars.note }),
    onSuccess: (payload) => {
      dispatch({ type: 'patchImage', image: payload.image })
      setSelectedImage((prev) => (prev !== null && prev.id === payload.image.id ? payload.image : prev))
      toast.success('更新备注成功')
    },
    onError: (error) => {
      toast.error('更新图片备注失败', { description: error.message })
    },
  })
  const submitUpdateNote = updateNoteMutation.mutate
  const isUpdatingNote = updateNoteMutation.isPending

  const recalculateMutation = useMutation({
    mutationFn: (id: string) => orpc.admin.images.recalculateThumbhash({ id }),
    onSuccess: (payload) => {
      dispatch({ type: 'patchImage', image: payload.image })
      setSelectedImage((prev) => (prev !== null && prev.id === payload.image.id ? payload.image : prev))
      toast.success('重新计算缩略图成功')
    },
    onError: (error) => {
      toast.error('重新计算缩略图失败', { description: error.message })
    },
  })
  const submitRecalculate = recalculateMutation.mutate
  const isRecalculating = recalculateMutation.isPending

  const [qInput, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: (value) => dispatch({ type: 'setQ', value }),
  })

  const isLoading = isListPending && state.rows.length === 0
  const totalPages = useMemo(() => Math.max(1, Math.ceil(state.total / state.pageSize)), [state.total, state.pageSize])

  const onCopyUrl = useCallback((image: AdminImageDto) => {
    void navigator.clipboard.writeText(image.publicUrl).then(() => {
      setCopiedId(image.id)
      setTimeout(() => {
        setCopiedId((prev) => (prev === image.id ? null : prev))
      }, 1500)
    })
  }, [])

  const onSaveNote = useCallback(
    (image: AdminImageDto, note: string | null) => {
      submitUpdateNote({ id: image.id, note })
    },
    [submitUpdateNote],
  )

  const onDelete = useCallback(
    (image: AdminImageDto) => {
      setConfirm({
        title: `删除图片「${image.storagePath.split('/').pop() ?? image.storagePath}」？`,
        description: '此操作会从 S3 删除原始对象，并把元数据标记为软删除。引用该图片的页面将出现 404。',
        actionLabel: '删除',
        destructive: true,
        onConfirm: () => {
          dispatch({ type: 'removeImage', id: image.id })
          submitDelete(image.id)
          setSelectedImage(null)
        },
      })
    },
    [dispatch, submitDelete],
  )

  const onRecalculateThumbhash = useCallback(
    (image: AdminImageDto) => {
      submitRecalculate(image.id)
    },
    [submitRecalculate],
  )

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header title="图片管理" description={`共 ${state.total} 条。删除时同步移除 S3 中的原始对象。`}>
          <Button type="button" variant="outline" className="border-ink-4" onClick={reload} disabled={isListPending}>
            <RefreshCwIcon /> 刷新
          </Button>
          <Button type="button" onClick={() => setUploadOpen(true)}>
            <PlusIcon /> 上传图片
          </Button>
        </AdminListPage.Header>

        <AdminListPage.Toolbar>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <AdminListPage.FilterField label="搜索（路径 / 备注）">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    value={qInput}
                    onChange={(e) => setQInput(e.target.value)}
                    placeholder="输入关键字 — 例：images/2024 / 备注"
                  />
                </InputGroup>
              </AdminListPage.FilterField>
            </div>
            <AdminListPage.FilterField label="用途">
              <Select
                items={KIND_OPTIONS}
                value={state.kind}
                onValueChange={(value) =>
                  dispatch({ type: 'setKind', value: (value ?? 'all') as AdminImageKind | 'all' })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminListPage.FilterField>
            <AdminListPage.FilterField label="每页显示">
              <Select
                items={PAGE_SIZE_OPTIONS}
                value={String(state.pageSize)}
                onValueChange={(value) => dispatch({ type: 'setPageSize', value: Number.parseInt(value ?? '60', 10) })}
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
          {isLoading ? (
            <ImagesGridSkeleton />
          ) : state.rows.length === 0 ? (
            <Card className="p-0">
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ImageOffIcon />
                  </EmptyMedia>
                  <EmptyTitle>未找到图片</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {state.rows.map((row) => (
                <ImageCard key={row.id} image={row} onClick={() => setSelectedImage(row)} />
              ))}
            </div>
          )}
        </AdminListPage.Body>

        <AdminListPage.PageNavigation
          totalPages={totalPages}
          currentPage={state.currentPage}
          onChange={(page) => dispatch({ type: 'setCurrentPage', value: page })}
        />
      </AdminListPage>

      <ImageDetailDialog
        image={selectedImage}
        open={selectedImage !== null}
        onClose={() => setSelectedImage(null)}
        copied={selectedImage !== null && copiedId === selectedImage.id}
        isSavingNote={isUpdatingNote}
        isRecalculatingThumbhash={isRecalculating}
        onCopyUrl={onCopyUrl}
        onSaveNote={onSaveNote}
        onDelete={onDelete}
        onRecalculateThumbhash={onRecalculateThumbhash}
      />

      <UploadImageDialog
        open={uploadOpen}
        kind={{ kind: 'generic' }}
        onClose={() => setUploadOpen(false)}
        onUploaded={(image) => {
          dispatch({ type: 'prependImage', image })
          setUploadOpen(false)
        }}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function ImagesGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
      {Array.from({ length: 24 }).map((_, i) => (
        // Skeleton tiles — identical placeholders, swapped wholesale on load.
        // oxlint-disable-next-line react/no-array-index-key
        <Skeleton key={i} className="aspect-square w-full rounded-xl" />
      ))}
    </div>
  )
}
