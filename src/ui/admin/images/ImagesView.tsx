import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ImageOffIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { AdminImageDto, AdminImageKind } from '@/shared/types/images'

import { orpc } from '@/client/api/client'
import { useAssetsSettings } from '@/shared/lib/blog-config-context'
import { ImageDetailDialog } from '@/ui/admin/images/ImageDetailDialog'
import { JustifiedImageGrid, JustifiedImageGridSkeleton } from '@/ui/admin/images/JustifiedImageGrid'
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

// Infinite-scroll image library. Filter state lives in `useImagesController`;
// the actual pages are fetched via `useInfiniteQuery` and laid out by
// `JustifiedImageGrid` using a Google Photos-style justified-row algorithm.
export function ImagesView() {
  const { state, dispatch } = useImagesController()
  const { asset, storage } = useAssetsSettings()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<AdminImageDto | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const queryKey = useMemo(
    () => ['admin', 'images', 'list', { q: state.q, kind: state.kind, pageSize: state.pageSize }],
    [state.q, state.kind, state.pageSize],
  )

  const listQuery = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) =>
      orpc.admin.images.list({
        q: state.q || undefined,
        kind: state.kind === 'all' ? undefined : state.kind,
        offset: pageParam,
        limit: state.pageSize,
      }),
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasMore) {
        return undefined
      }
      return (lastPageParam ?? 0) + state.pageSize
    },
    initialPageParam: 0,
  })

  const { hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } = listQuery

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage || isFetchingNextPage) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const allImages = useMemo(() => listQuery.data?.pages.flatMap((page) => page.images) ?? [], [listQuery.data])
  const total = listQuery.data?.pages[0]?.total ?? 0

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载图片列表失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'images', 'list'], exact: false })
  }, [queryClient])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orpc.admin.images.delete({ id }),
    onSuccess: () => {
      setSelectedImage(null)
      toast.success('删除成功')
      invalidateList()
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
      setSelectedImage((prev) => (prev !== null && prev.id === payload.image.id ? payload.image : prev))
      toast.success('更新备注成功')
      invalidateList()
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
      setSelectedImage((prev) => (prev !== null && prev.id === payload.image.id ? payload.image : prev))
      toast.success('重新计算缩略图成功')
      invalidateList()
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
          submitDelete(image.id)
          setSelectedImage(null)
        },
      })
    },
    [submitDelete],
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
        <AdminListPage.Header title="图片管理" description={`共 ${total} 条。删除时同步移除 S3 中的原始对象。`}>
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
            <AdminListPage.FilterField label="每次加载">
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
            <JustifiedImageGridSkeleton />
          ) : allImages.length === 0 ? (
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
            <>
              <JustifiedImageGrid
                images={allImages}
                assetHost={asset.host}
                urlTemplate={storage.urlTemplate}
                onSelect={setSelectedImage}
              />
              <div ref={sentinelRef} className="mt-8 flex items-center justify-center">
                {isFetchingNextPage && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
                    加载中…
                  </div>
                )}
                {!hasNextPage && allImages.length > 0 && (
                  <p className="text-sm text-muted-foreground">已加载全部 {total} 张图片</p>
                )}
              </div>
            </>
          )}
        </AdminListPage.Body>
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
        onUploaded={() => {
          setUploadOpen(false)
          invalidateList()
        }}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
