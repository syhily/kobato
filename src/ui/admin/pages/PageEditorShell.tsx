import type { NavigateFunction } from 'react-router'

import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  Loader2Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SaveIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  Undo2Icon,
  UploadIcon,
} from 'lucide-react'
import { Link } from 'react-router'

import type { AdminPageDetailDto, AdminPageDto, UpsertPageMetaInput } from '@/shared/types/pages'

import { orpc } from '@/client/api/client'
import { useCreatePageDraft } from '@/client/hooks/use-create-page-draft'
import { usePageLocalDraft } from '@/client/hooks/use-page-local-draft'
import { ActionBanner } from '@/ui/admin/editor-shell/ActionBanner'
import { DraftConflictDialog } from '@/ui/admin/editor-shell/DraftConflictDialog'
import { FloatingPublishButton } from '@/ui/admin/editor-shell/FloatingPublishButton'
import { PreviewPane } from '@/ui/admin/editor-shell/PreviewPanel'
import { RevisionHistoryDrawer } from '@/ui/admin/editor-shell/RevisionsDrawer'
import { useEditorShellState } from '@/ui/admin/editor-shell/use-editor-shell-state'
import { PageBodyEditor } from '@/ui/admin/editor/PageBodyEditor'
import { buildPageUpsertPayload } from '@/ui/admin/pages/build-page-upsert-payload'
import { CreateModeBanner } from '@/ui/admin/pages/CreateModeBanner'
import {
  EMPTY_META_DRAFT,
  metaDraftFromPage,
  metaDraftsEqual,
  MetaSidebar,
  type PageMetaDraft,
} from '@/ui/admin/pages/MetaSidebar'
import { TitleSlugStrip } from '@/ui/admin/pages/TitleSlugStrip'
import { usePageDeleteRestore } from '@/ui/admin/pages/use-page-delete-restore'
import { ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { Button } from '@/ui/components/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/components/sheet'
import { cn } from '@/ui/lib/cn'

export interface PageEditorShellProps {
  mode: 'create' | 'edit'
  detail?: AdminPageDetailDto
  navigate: NavigateFunction
}

// Top-level orchestrator for the page authoring screen. All shared
// state lives in `useEditorShellState`; this Shell wires the
// entity-specific mutations + LS hooks + sidebar component and
// renders the toolbar / layout / dialog markup.
export function PageEditorShell({ mode, detail, navigate }: PageEditorShellProps) {
  // Local narrowing flag so TS knows `detail` is defined in the
  // `isEditing` JSX branches below.
  const isEditing = mode === 'edit' && detail !== undefined
  const { confirm, setConfirm, handleDelete, handleRestore } = usePageDeleteRestore(isEditing ? detail : undefined)

  // --- Shared state hook ---------------------------------------------------
  // The hook owns `useMutation()` internally — Shell only provides
  // entity-specific mutation functions + the LS hook factories.
  const state = useEditorShellState<PageMetaDraft, AdminPageDto, UpsertPageMetaInput>({
    mode,
    entityKind: 'page',
    detail: detail
      ? {
          entity: detail.page,
          latestRevision: detail.latestRevision,
          publishedRevision: detail.publishedRevision,
        }
      : undefined,
    emptyMeta: EMPTY_META_DRAFT,
    metaDraftFromEntity: metaDraftFromPage,
    metaDraftsEqual,
    useLocalDraftHook: ({ entityId, clientRevisionToken, body, disabled }) =>
      usePageLocalDraft({ pageId: entityId, clientRevisionToken, body, disabled }),
    useCreateDraftHook: ({ body, meta }) => useCreatePageDraft({ body, meta }),
    upsertMetaFn: async (input) => {
      const result = await orpc.admin.pages.upsertMeta(input)
      return result.page
    },
    saveDraftFn: (input) => orpc.admin.pages.saveDraft(input),
    publishFn: (input) => orpc.admin.pages.publishLatest(input),
    unpublishFn: async (input) => {
      const result = await orpc.admin.pages.unpublish(input)
      return result.page
    },
    buildUpsertMetaPayload: buildPageUpsertPayload,
    directSaveDraft: (input) => orpc.admin.pages.saveDraft(input),
    editPath: (id) => `/editor/page/${id}`,
    navigate,
  })

  return (
    <div
      className={cn(
        'flex flex-col gap-0 p-2 md:gap-4 md:p-4',
        state.previewOpen ? 'min-h-0 flex-1' : 'min-h-[calc(100vh-4rem)]',
      )}
    >
      {/* Toolbar splits into two intent groups that share a single row
       *  when there is room — see `PostEditorShell` for the full
       *  rationale (LEFT-first icon collapse, RIGHT keeps labels longer
       *  for destructive actions, `flex-wrap` rescues the meta button
       *  on iPhone widths). */}
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link to="/admin/pages">
                <ArrowLeftIcon />
                <span className="sr-only lg:not-sr-only">返回列表</span>
              </Link>
            }
          />
          {isEditing ? (
            <Button
              variant="ghost"
              size="sm"
              render={
                <Link to={`/${detail.page.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  <span className="sr-only lg:not-sr-only">公开预览</span>
                </Link>
              }
            />
          ) : null}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <Button
            variant={state.previewOpen ? 'default' : 'outline'}
            size="sm"
            onClick={() => state.setPreviewOpen((open) => !open)}
            title={state.previewOpen ? '关闭实时预览，恢复菜单' : '开启实时预览，并折叠左侧菜单'}
            aria-pressed={state.previewOpen}
            className={cn('hidden lg:inline-flex', state.previewOpen && 'border border-transparent')}
          >
            {state.previewOpen ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
            <span className="sr-only sm:not-sr-only">实时预览</span>
          </Button>
          {mode === 'create' ? (
            <Button
              size="sm"
              onClick={() => {
                void state.persistCreate()
              }}
              disabled={state.isPending || !state.canPersistMeta}
              title="保存页面信息并上传当前正文"
            >
              {state.isCreating ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
              <span className="sr-only sm:not-sr-only">{state.isCreating ? '创建中…' : '创建页面'}</span>
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={state.persistSave}
                disabled={state.isPending || !state.canPersistMeta}
                title="保存页面信息（立即生效），并在正文与最新版本不一致时另存为新草稿 (Cmd/Ctrl+S)"
              >
                {state.isSavingDraft ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                <span className="sr-only sm:not-sr-only">{state.isSavingDraft ? '保存中…' : '保存草稿'}</span>
              </Button>
              <Button
                size="sm"
                onClick={state.persistPublish}
                disabled={state.isPending || !state.canPublish}
                title={
                  state.canPublish
                    ? state.sidebarPublishStatus === 'scheduled'
                      ? '将最新草稿按计划时间上线 (Cmd/Ctrl+Shift+P)'
                      : '将最新草稿发布到线上 (Cmd/Ctrl+Shift+P)'
                    : '当前没有待发布的草稿'
                }
              >
                {state.isPublishing ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
                <span className="sr-only sm:not-sr-only">
                  {state.isPublishing
                    ? '发布中…'
                    : state.sidebarPublishStatus === 'scheduled'
                      ? '计划发布'
                      : '发布草稿'}
                </span>
              </Button>
              {state.meta.published ? (
                <Button
                  variant="destructive-soft"
                  size="sm"
                  onClick={state.persistUnpublish}
                  disabled={state.isPending}
                  title="将页面下线，公开访问会返回 404；正文不会丢失，再次发布草稿即可恢复"
                >
                  {state.isUnpublishing ? <Loader2Icon className="animate-spin" /> : <EyeOffIcon />}
                  <span className="sr-only sm:not-sr-only">{state.isUnpublishing ? '取消中…' : '取消发布'}</span>
                </Button>
              ) : null}
            </>
          )}
          <Button
            variant={state.metaOpen ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => state.setMetaOpen((open) => !open)}
            title={state.metaOpen ? '隐藏页面信息面板' : '展开页面信息面板'}
            aria-pressed={state.metaOpen}
            aria-label="切换页面信息面板"
            className={cn(state.metaOpen && 'border border-transparent')}
          >
            <SlidersHorizontalIcon />
            <span className="sr-only sm:not-sr-only">元数据</span>
          </Button>
        </div>
      </header>

      {isEditing && state.previewBanner !== null ? (
        <ActionBanner
          kind={state.previewBanner.kind}
          slug={state.previewBanner.slug}
          basePath=""
          onClose={state.dismissPreviewBanner}
        />
      ) : null}

      <div
        className={cn(
          'mt-4 grid min-h-0 gap-4 md:mt-0',
          state.previewOpen ? 'flex-1' : 'grow',
          !state.previewOpen && state.metaOpen && 'lg:grid-cols-[minmax(0,1fr)_360px]',
          !state.previewOpen && !state.metaOpen && 'lg:grid-cols-[minmax(0,1fr)]',
          state.previewOpen && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {mode === 'create' ? <CreateModeBanner draftSavedAt={state.createDraftSavedAt} /> : null}
          {!state.previewOpen ? (
            <TitleSlugStrip
              title={state.meta.title}
              slug={state.meta.slug}
              onTitleChange={(value) => state.setMeta((m) => ({ ...m, title: value }))}
              onSlugChange={(value) => state.setMeta((m) => ({ ...m, slug: value }))}
              disabled={state.isPending}
            />
          ) : null}
          <PageBodyEditor
            initialBody={state.initialBody}
            bodyKey={state.bodyKey}
            onBodyChange={state.setBody}
            disabled={state.isPending}
            livePreviewOpen={state.previewOpen}
            scrollContainerRef={state.editorScrollRef}
            floatingActions={
              isEditing ? (
                <FloatingPublishButton
                  onPublish={state.persistPublish}
                  disabled={state.isPending || !state.canPublish}
                  pending={state.isPublishing}
                  title={
                    state.canPublish
                      ? state.sidebarPublishStatus === 'scheduled'
                        ? '将最新草稿按计划时间上线 (Cmd/Ctrl+Shift+P)'
                        : '将最新草稿发布到线上 (Cmd/Ctrl+Shift+P)'
                      : '当前没有待发布的草稿'
                  }
                />
              ) : null
            }
          />
        </div>
        {state.previewOpen ? (
          <section aria-label="实时预览" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PreviewPane
              body={state.body}
              title={state.meta.title}
              slug={state.meta.slug}
              scrollContainerRef={state.previewScrollRef}
            />
          </section>
        ) : null}
        {!state.previewOpen && state.metaOpen ? (
          <aside className="hidden min-h-0 flex-col overflow-y-auto pr-1 lg:flex">
            <MetaSidebar
              draft={state.meta}
              onChange={state.setMeta}
              disabled={state.isPending}
              publishStatus={state.sidebarPublishStatus}
              ogPreviewSlug={isEditing ? detail.page.slug : null}
              revisionSummary={state.sidebarRevisionSummary}
              saveStatus={state.sidebarSaveStatus}
              extras={
                isEditing ? (
                  <>
                    <div className="rounded-xl border bg-card p-2">
                      <RevisionHistoryDrawer
                        type="page"
                        ownerId={detail.page.id}
                        currentToken={state.expectedToken}
                        currentBody={state.body}
                        onAdoptRevision={state.adoptRevisionFromHistory}
                      />
                    </div>
                    <div className="group/delete rounded-xl border border-destructive/30 p-2 transition-colors hover:bg-destructive">
                      {detail.page.deletedAt !== null ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-destructive group-hover/delete:text-white hover:bg-transparent hover:text-white"
                          type="button"
                          onClick={handleRestore}
                        >
                          <Undo2Icon /> 恢复页面
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-destructive group-hover/delete:text-white hover:bg-transparent hover:text-white"
                          type="button"
                          onClick={handleDelete}
                        >
                          <Trash2Icon /> 删除页面
                        </Button>
                      )}
                    </div>
                  </>
                ) : null
              }
            />
          </aside>
        ) : null}
      </div>
      {state.previewOpen || !state.isLg ? (
        <Sheet open={state.metaOpen} onOpenChange={state.setMetaOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
            <SheetHeader className="border-b">
              <SheetTitle>页面信息</SheetTitle>
              <SheetDescription>编辑标题、Slug、SEO、发布时间等元数据。</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <MetaSidebar
                draft={state.meta}
                onChange={state.setMeta}
                disabled={state.isPending}
                publishStatus={state.sidebarPublishStatus}
                ogPreviewSlug={isEditing ? detail.page.slug : null}
                revisionSummary={state.sidebarRevisionSummary}
                saveStatus={state.sidebarSaveStatus}
                extras={
                  isEditing ? (
                    <>
                      <div className="rounded-xl border bg-card p-2">
                        <RevisionHistoryDrawer
                          type="page"
                          ownerId={detail.page.id}
                          currentToken={state.expectedToken}
                          currentBody={state.body}
                          onAdoptRevision={state.adoptRevisionFromHistory}
                        />
                      </div>
                      <div className="group/delete rounded-xl border border-destructive/30 p-2 transition-colors hover:bg-destructive">
                        {detail.page.deletedAt !== null ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-destructive group-hover/delete:text-white hover:bg-transparent hover:text-white"
                            type="button"
                            onClick={handleRestore}
                          >
                            <Undo2Icon /> 恢复页面
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-destructive group-hover/delete:text-white hover:bg-transparent hover:text-white"
                            type="button"
                            onClick={handleDelete}
                          >
                            <Trash2Icon /> 删除页面
                          </Button>
                        )}
                      </div>
                    </>
                  ) : null
                }
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      {state.conflict !== null && isEditing ? (
        <DraftConflictDialog
          open={true}
          localBody={state.conflict.localBody}
          serverBody={state.initialBody}
          localSavedAt={state.conflict.localSavedAt}
          serverUpdatedAt={
            (detail.latestRevision ?? detail.publishedRevision)?.updatedAt
              ? Date.parse((detail.latestRevision ?? detail.publishedRevision)!.updatedAt)
              : null
          }
          onChooseLocal={() => {
            void state.adoptLocalDraft()
          }}
          onChooseServer={state.adoptServerVersion}
        />
      ) : null}
    </div>
  )
}
