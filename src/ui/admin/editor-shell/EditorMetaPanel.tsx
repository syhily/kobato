import type { ReactNode } from 'react'
import type { NavigateFunction } from 'react-router'

import { Trash2Icon, Undo2Icon } from 'lucide-react'

import type {
  EditorSidebarState,
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { RevisionHistoryDrawer } from '@/ui/admin/editor-shell/RevisionsDrawer'
import { useEditorDeleteRestore } from '@/ui/admin/editor-shell/use-editor-delete-restore'
import { ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { Button } from '@/ui/components/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/components/sheet'

/** Props handed to the entity's meta-sidebar render slot. */
export interface MetaSidebarSlotProps<TMeta> {
  draft: TMeta
  onChange: (next: TMeta) => void
  disabled: boolean
  publishStatus: SidebarPublishStatus | null
  ogPreviewSlug: string | null
  revisionSummary: SidebarRevisionSummary | null
  saveStatus: SidebarSaveStatus
  extras: ReactNode
}

export interface EditorMetaPanelDeleteRestore {
  listPath: string
  deleteFn: (id: string) => Promise<unknown>
  restoreFn: (id: string) => Promise<unknown>
  invalidateList: () => void
  navigate: NavigateFunction
}

export interface EditorMetaPanelProps<TMeta> {
  entityKind: 'post' | 'page'
  /** Display noun woven into the Sheet / button copy (`文章` / `页面`). */
  entityLabel: string
  /** Edit-mode entity; `undefined` in create mode (extras stay unmounted). */
  entity: { id: string; slug: string; title: string; deletedAt: string | null } | undefined
  previewOpen: boolean
  metaOpen: boolean
  setMetaOpen: React.Dispatch<React.SetStateAction<boolean>>
  isLg: boolean
  sidebar: EditorSidebarState<TMeta>
  renderSidebar: (props: MetaSidebarSlotProps<TMeta>) => ReactNode
  deleteRestore: EditorMetaPanelDeleteRestore
}

/**
 * Mounts exactly one sidebar instance: aside column on large screens with
 * the preview closed, `Sheet` overlay everywhere else. A single instance
 * keeps the revision-history query and delete/restore mutations from
 * running twice (the old CSS-hidden dual mount ran both).
 */
export function EditorMetaPanel<TMeta>({
  entityKind,
  entityLabel,
  entity,
  previewOpen,
  metaOpen,
  setMetaOpen,
  isLg,
  sidebar,
  renderSidebar,
  deleteRestore,
}: EditorMetaPanelProps<TMeta>) {
  const { confirm, setConfirm, handleDelete, handleRestore } = useEditorDeleteRestore({
    entity,
    entityLabel,
    listPath: deleteRestore.listPath,
    deleteFn: deleteRestore.deleteFn,
    restoreFn: deleteRestore.restoreFn,
    invalidateList: deleteRestore.invalidateList,
    navigate: deleteRestore.navigate,
  })

  const extras =
    entity !== undefined ? (
      <>
        <div className="rounded-xl border bg-card p-2">
          <RevisionHistoryDrawer
            type={entityKind}
            ownerId={entity.id}
            currentToken={sidebar.expectedToken}
            currentBody={sidebar.body}
            onAdoptRevision={sidebar.adoptRevisionFromHistory}
          />
        </div>
        <div className="group/delete rounded-xl border border-destructive/30 p-2 transition-colors hover:bg-destructive">
          {entity.deletedAt !== null ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive group-hover/delete:text-white hover:bg-transparent hover:text-white"
              type="button"
              onClick={handleRestore}
            >
              <Undo2Icon /> 恢复{entityLabel}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive group-hover/delete:text-white hover:bg-transparent hover:text-white"
              type="button"
              onClick={handleDelete}
            >
              <Trash2Icon /> 删除{entityLabel}
            </Button>
          )}
        </div>
      </>
    ) : null

  const sidebarNode = renderSidebar({
    draft: sidebar.draft,
    onChange: sidebar.onChange,
    disabled: sidebar.disabled,
    publishStatus: sidebar.publishStatus,
    ogPreviewSlug: entity?.slug ?? null,
    revisionSummary: sidebar.revisionSummary,
    saveStatus: sidebar.saveStatus,
    extras,
  })

  const useSheet = previewOpen || !isLg

  return (
    <>
      {useSheet ? (
        <Sheet open={metaOpen} onOpenChange={setMetaOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
            <SheetHeader className="border-b">
              <SheetTitle>{entityLabel}信息</SheetTitle>
              <SheetDescription>编辑标题、Slug、SEO、发布时间等元数据。</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">{sidebarNode}</div>
          </SheetContent>
        </Sheet>
      ) : metaOpen ? (
        <aside className="hidden min-h-0 flex-col overflow-y-auto pr-1 lg:flex">{sidebarNode}</aside>
      ) : null}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
