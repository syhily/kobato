import type { ReactNode } from 'react'
import type { NavigateFunction } from 'react-router'

import { Trash2Icon, Undo2Icon } from 'lucide-react'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
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
import { useI18n } from '@/ui/lib/I18nProvider'

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
  /** Display-noun message id woven into the Sheet / button copy (`admin.editor.entity.*`). */
  entityLabelId: UiMessageId
  /** Edit-mode entity; `undefined` in create mode (extras stay unmounted). */
  entity: { id: string; slug: string; title: string; deletedAt: string | null } | undefined
  metaOpen: boolean
  setMetaOpen: React.Dispatch<React.SetStateAction<boolean>>
  isLg: boolean
  sidebar: EditorSidebarState<TMeta>
  renderSidebar: (props: MetaSidebarSlotProps<TMeta>) => ReactNode
  deleteRestore: EditorMetaPanelDeleteRestore
}

/** Mounts exactly one sidebar instance: aside on large screens, `Sheet`
 *  elsewhere — a dual mount would run the history query and mutations twice. */
export function EditorMetaPanel<TMeta>({
  entityKind,
  entityLabelId,
  entity,
  metaOpen,
  setMetaOpen,
  isLg,
  sidebar,
  renderSidebar,
  deleteRestore,
}: EditorMetaPanelProps<TMeta>) {
  const { t } = useI18n()
  const entityLabel = t(entityLabelId)
  const { confirm, setConfirm, handleDelete, handleRestore } = useEditorDeleteRestore({
    entity,
    entityLabelId,
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
            onAdoptRevision={(revision) => sidebar.adoptRevisionFromHistory(revision)}
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
              <Undo2Icon /> {t('admin.editor.meta.restore', { entity: entityLabel })}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive group-hover/delete:text-white hover:bg-transparent hover:text-white"
              type="button"
              onClick={handleDelete}
            >
              <Trash2Icon /> {t('admin.editor.meta.delete', { entity: entityLabel })}
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

  const useSheet = !isLg

  return (
    <>
      {useSheet ? (
        <Sheet open={metaOpen} onOpenChange={setMetaOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
            <SheetHeader className="border-b">
              <SheetTitle>{t('admin.editor.meta.infoTitle', { entity: entityLabel })}</SheetTitle>
              <SheetDescription>{t('admin.editor.meta.infoDescription')}</SheetDescription>
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
