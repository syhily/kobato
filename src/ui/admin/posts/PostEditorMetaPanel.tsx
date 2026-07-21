import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2Icon, Undo2Icon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import type { AdminPostDetailDto } from '@/shared/types/posts'
import type { UseEditorShellStateOutput } from '@/ui/admin/editor-shell/editor-shell-types'
import type { PostMetaDraft } from '@/ui/admin/posts/PostMetaSidebar'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { useContentSettings } from '@/shared/lib/blog-config-context'
import { RevisionHistoryDrawer } from '@/ui/admin/editor-shell/RevisionsDrawer'
import { PostMetaSidebar } from '@/ui/admin/posts/PostMetaSidebar'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { Button } from '@/ui/components/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/components/sheet'

interface PostEditorMetaPanelProps {
  mode: 'create' | 'edit'
  detail?: AdminPostDetailDto
  state: UseEditorShellStateOutput<PostMetaDraft>
}

function MetaExtras({
  mode,
  detail,
  state,
  onDelete,
  onRestore,
}: PostEditorMetaPanelProps & { onDelete?: () => void; onRestore?: () => void }) {
  const isEditing = mode === 'edit' && detail !== undefined
  if (!isEditing) {
    return null
  }
  const post = detail.post
  const isDeleted = post.deletedAt !== null
  return (
    <>
      <div className="rounded-xl border bg-card p-2">
        <RevisionHistoryDrawer
          type="post"
          ownerId={post.id}
          currentToken={state.expectedToken}
          currentBody={state.body}
          onAdoptRevision={state.adoptRevisionFromHistory}
        />
      </div>
      <div className="group/delete rounded-xl border border-destructive/30 p-2 transition-colors hover:bg-destructive">
        {isDeleted ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-destructive group-hover/delete:text-white hover:bg-transparent hover:text-white"
            type="button"
            onClick={onRestore}
          >
            <Undo2Icon /> 恢复文章
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-destructive group-hover/delete:text-white hover:bg-transparent hover:text-white"
            type="button"
            onClick={onDelete}
          >
            <Trash2Icon /> 删除文章
          </Button>
        )}
      </div>
    </>
  )
}

function usePostDeleteRestore(detail: AdminPostDetailDto | undefined) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const post = detail?.post

  const deleteApi = useMutation({
    mutationFn: (id: string) => orpc.admin.posts.delete({ id }),
    onSuccess: () => {
      toast.success('文章已删除')
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.posts.list.key() })
      void navigate('/admin/posts')
    },
    onError: (error) => {
      setConfirm({
        title: '删除失败',
        description: error.message,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })

  const restoreApi = useMutation({
    mutationFn: (id: string) => orpc.admin.posts.restore({ id }),
    onSuccess: () => {
      toast.success('文章已恢复')
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.posts.list.key() })
      void navigate(0) // full reload to refetch
    },
    onError: (error) => {
      setConfirm({
        title: '恢复失败',
        description: error.message,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })

  const handleDelete = post
    ? () =>
        setConfirm({
          title: `删除文章「${post.title}」？`,
          description: '文章会被软删除（30 天内可恢复）。已发布的链接将立即返回 404。',
          actionLabel: '删除',
          destructive: true,
          onConfirm: () => deleteApi.mutate(post.id),
        })
    : undefined

  const handleRestore = post ? () => restoreApi.mutate(post.id) : undefined

  return { confirm, setConfirm, handleDelete, handleRestore }
}

export function PostEditorMetaAside({ mode, detail, state }: PostEditorMetaPanelProps) {
  const contentSettings = useContentSettings()
  const featureEnabled = contentSettings.post.featureEnabled
  const isEditing = mode === 'edit' && detail !== undefined
  const { confirm, setConfirm, handleDelete, handleRestore } = usePostDeleteRestore(isEditing ? detail : undefined)

  return (
    <>
      <aside className="hidden min-h-0 flex-col overflow-y-auto pr-1 lg:flex">
        <PostMetaSidebar
          draft={state.meta}
          onChange={state.setMeta}
          disabled={state.isPending}
          publishStatus={state.sidebarPublishStatus}
          ogPreviewSlug={detail?.post.slug ?? null}
          revisionSummary={state.sidebarRevisionSummary}
          saveStatus={state.sidebarSaveStatus}
          featureGate={featureEnabled ? 'enabled' : 'disabled'}
          extras={
            <MetaExtras mode={mode} detail={detail} state={state} onDelete={handleDelete} onRestore={handleRestore} />
          }
        />
      </aside>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

export function PostEditorMetaSheet({ mode, detail, state }: PostEditorMetaPanelProps) {
  const contentSettings = useContentSettings()
  const featureEnabled = contentSettings.post.featureEnabled
  const isEditing = mode === 'edit' && detail !== undefined
  const { confirm, setConfirm, handleDelete, handleRestore } = usePostDeleteRestore(isEditing ? detail : undefined)

  return (
    <>
      <Sheet open={state.metaOpen} onOpenChange={state.setMetaOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle>文章信息</SheetTitle>
            <SheetDescription>编辑标题、Slug、SEO、发布时间等元数据。</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <PostMetaSidebar
              draft={state.meta}
              onChange={state.setMeta}
              disabled={state.isPending}
              publishStatus={state.sidebarPublishStatus}
              ogPreviewSlug={detail?.post.slug ?? null}
              revisionSummary={state.sidebarRevisionSummary}
              saveStatus={state.sidebarSaveStatus}
              featureGate={featureEnabled ? 'enabled' : 'disabled'}
              extras={
                <MetaExtras
                  mode={mode}
                  detail={detail}
                  state={state}
                  onDelete={handleDelete}
                  onRestore={handleRestore}
                />
              }
            />
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
