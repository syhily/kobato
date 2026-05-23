import type { AdminPostDetailDto } from '@/shared/types/posts'

import type { PostMetaDraft } from '@/ui/admin/posts/PostMetaSidebar'
import type { UseEditorShellStateOutput } from '@/ui/admin/editor-shell/editor-shell-types'

import { useContentSettings } from '@/shared/lib/blog-config-context'
import { RevisionHistoryDrawer } from '@/ui/admin/editor-shell/RevisionsDrawer'
import {
  PostMetaSidebar,
} from '@/ui/admin/posts/PostMetaSidebar'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/components/sheet'

interface PostEditorMetaPanelProps {
  isEditing: boolean
  detail?: AdminPostDetailDto
  state: UseEditorShellStateOutput<PostMetaDraft>
}

function renderMetaExtras(isEditing: boolean, detail: AdminPostDetailDto | undefined, state: UseEditorShellStateOutput<PostMetaDraft>) {
  if (!isEditing) {
    return null
  }
  return (
    <div className="rounded-md border bg-card p-2">
      <RevisionHistoryDrawer
        type="post"
        ownerId={detail!.post.id}
        currentToken={state.expectedToken}
        currentBody={state.body}
        onAdoptRevision={state.adoptRevisionFromHistory}
      />
    </div>
  )
}

export function PostEditorMetaAside({ isEditing, detail, state }: PostEditorMetaPanelProps) {
  const contentSettings = useContentSettings()
  const featureEnabled = contentSettings.post.featureEnabled

  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto pr-1 lg:flex">
      <PostMetaSidebar
        draft={state.meta}
        onChange={state.setMeta}
        disabled={state.isPending}
        publishStatus={state.sidebarPublishStatus}
        ogPreviewSlug={isEditing ? detail!.post.slug : null}
        revisionSummary={state.sidebarRevisionSummary}
        saveStatus={state.sidebarSaveStatus}
        featureEnabled={featureEnabled}
        extras={renderMetaExtras(isEditing, detail, state)}
      />
    </aside>
  )
}

export function PostEditorMetaSheet({ isEditing, detail, state }: PostEditorMetaPanelProps) {
  const contentSettings = useContentSettings()
  const featureEnabled = contentSettings.post.featureEnabled

  return (
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
            ogPreviewSlug={isEditing ? detail!.post.slug : null}
            revisionSummary={state.sidebarRevisionSummary}
            saveStatus={state.sidebarSaveStatus}
            featureEnabled={featureEnabled}
            extras={renderMetaExtras(isEditing, detail, state)}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
