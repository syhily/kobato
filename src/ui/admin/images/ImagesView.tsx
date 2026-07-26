import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImageOffIcon, PlusIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import type { AdminImageDto } from '@/shared/contracts/images'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { useAssetsSettings } from '@/shared/lib/blog-config-context'
import { ImageDetailDialog } from '@/ui/admin/images/ImageDetailDialog'
import { ImagesFilterBar } from '@/ui/admin/images/ImagesFilterBar'
import { JustifiedImageGrid, JustifiedImageGridSkeleton } from '@/ui/admin/images/JustifiedImageGrid'
import { useImagesReducer } from '@/ui/admin/images/useImagesReducer'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { UploadImageDialog } from '@/ui/admin/shared/UploadImageDialog'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'

// Infinite-scroll image library. Filter state lives in `useImagesReducer`;
// the actual pages are fetched via `useInfiniteQuery` and laid out by
// `JustifiedImageGrid` using a Google Photos-style justified-row algorithm.
export function ImagesView() {
  const { q, kind, dispatch, pageSize, activeFilters } = useImagesReducer()
  const { asset, storage } = useAssetsSettings()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<AdminImageDto | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const {
    rows: allImages,
    total,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  } = useAdminInfiniteList({
    namespace: orpcQuery.admin.images.list,
    pageSize,
    buildInput: (offset) => ({
      q: q || undefined,
      kind: kind === 'all' ? undefined : kind,
      offset,
      limit: pageSize,
    }),
    selectRows: (page) => page.images,
    noun: '图片',
  })

  // The grid caches as `type: 'infinite'` and the editor's
  // ImageLibraryPicker as `type: 'query'` — the procedure-level orpcQuery
  // key partial-matches both; a hand-rolled key array never would.
  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.images.list.key() })
  }, [queryClient])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orpc.admin.images.delete({ id }),
    onSuccess: () => {
      setSelectedImage(null)
      toast.success('图片已删除')
      invalidateList()
    },
    onError: (error) => {
      toast.error('删除图片失败', { description: error.message })
    },
  })

  const updateNoteMutation = useMutation({
    mutationFn: (vars: { id: string; note: string | null }) =>
      orpc.admin.images.updateNote({ id: vars.id, note: vars.note }),
    onSuccess: (payload) => {
      setSelectedImage((prev) => (prev !== null && prev.id === payload.image.id ? payload.image : prev))
      toast.success('备注已更新')
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
      toast.success('缩略图已重新计算')
      invalidateList()
    },
    onError: (error) => {
      toast.error('重新计算缩略图失败', { description: error.message })
    },
  })
  const submitRecalculate = recalculateMutation.mutate
  const isRecalculating = recalculateMutation.isPending

  const [, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: (value) => dispatch({ type: 'setQ', value }),
  })

  const handleAddFilter = useCallback(
    (field: 'q' | 'kind', value: string, label: string) => {
      dispatch({ type: 'addFilter', field, value, label })
      if (field === 'q') {
        setQInput(value)
      }
    },
    [dispatch, setQInput],
  )

  const handleRemoveFilter = useCallback(
    (field: 'q' | 'kind') => {
      dispatch({ type: 'removeFilter', field })
      if (field === 'q') {
        setQInput('')
      }
    },
    [dispatch, setQInput],
  )

  const handleClearFilters = useCallback(() => {
    setQInput('')
    dispatch({ type: 'clearFilters' })
  }, [dispatch, setQInput])

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
          deleteMutation.mutate(image.id)
          setSelectedImage(null)
        },
      })
    },
    [deleteMutation],
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

        <ImagesFilterBar
          filters={activeFilters}
          onAddFilter={handleAddFilter}
          onRemoveFilter={handleRemoveFilter}
          onClearFilters={handleClearFilters}
        />

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
