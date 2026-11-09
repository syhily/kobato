import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImageOffIcon, PlusIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import type { AdminImageDto } from '@/shared/contracts/images'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError } from '@/client/lib/toast-api-error'
import { useAssetsSettings, useSiteIdentity } from '@/shared/lib/blog-config-context'
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
import { useI18n } from '@/ui/lib/I18nProvider'

// Infinite-scroll image library: filter state in `useImagesReducer`, rows cached via `useInfiniteQuery`.
export function ImagesView() {
  const { t } = useI18n()
  const { q, kind, dispatch, pageSize, activeFilters } = useImagesReducer()
  const { asset, storage } = useAssetsSettings()
  const { website } = useSiteIdentity()
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
    noun: 'admin.list.noun.images',
  })

  // Both cache types (`infinite` grid, `query` picker) — the procedure-level key partial-matches both.
  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.images.list.key() })
  }, [queryClient])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orpc.admin.images.delete({ id }),
    onSuccess: () => {
      setSelectedImage(null)
      toast.success(t('admin.images.deleted'))
      invalidateList()
    },
    onError: onMutationError('admin.toast.imageDeleteFailed', t),
  })

  const updateNoteMutation = useMutation({
    mutationFn: (vars: { id: string; note: string | null }) =>
      orpc.admin.images.updateNote({ id: vars.id, note: vars.note }),
    onSuccess: (payload) => {
      setSelectedImage((prev) => (prev !== null && prev.id === payload.image.id ? payload.image : prev))
      toast.success(t('admin.images.noteUpdated'))
      invalidateList()
    },
    onError: onMutationError('admin.toast.imageNoteUpdateFailed', t),
  })
  const submitUpdateNote = updateNoteMutation.mutate
  const isUpdatingNote = updateNoteMutation.isPending

  const recalculateMutation = useMutation({
    mutationFn: (id: string) => orpc.admin.images.recalculateThumbhash({ id }),
    onSuccess: (payload) => {
      setSelectedImage((prev) => (prev !== null && prev.id === payload.image.id ? payload.image : prev))
      toast.success(t('admin.images.thumbhashUpdated'))
      invalidateList()
    },
    onError: onMutationError('admin.toast.thumbnailRebuildFailed', t),
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
        title: t('admin.images.deleteTitle', {
          name: image.storagePath.split('/').pop() ?? image.storagePath,
        }),
        description: t('admin.images.deleteBody'),
        actionLabel: t('common.action.delete'),
        destructive: true,
        onConfirm: () => {
          deleteMutation.mutate(image.id)
          setSelectedImage(null)
        },
      })
    },
    [deleteMutation, t],
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
        <AdminListPage.Header
          title={t('admin.images.title')}
          description={t('admin.images.description', { count: total })}
        >
          <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
            <PlusIcon data-icon /> {t('admin.images.upload')}
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
                  <EmptyTitle>{t('admin.images.empty')}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </Card>
          ) : (
            <>
              <JustifiedImageGrid
                images={allImages}
                assetHost={asset.host}
                urlTemplate={storage.urlTemplate}
                siteOrigin={website}
                onSelect={setSelectedImage}
                sentinelRef={sentinelRef}
              />
              <div className="mt-8 flex items-center justify-center">
                {isFetchingNextPage && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
                    {t('common.state.loading')}
                  </div>
                )}
                {!hasNextPage && allImages.length > 0 && (
                  <p className="text-sm text-muted-foreground">{t('admin.images.allLoaded', { count: total })}</p>
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
