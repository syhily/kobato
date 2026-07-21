import type { NavigateFunction } from 'react-router'

import { useQueryClient } from '@tanstack/react-query'

import type { AdminPageDetailDto, PageMetaDraft, UpsertPageMetaInput } from '@/shared/types/pages'
import type { EditorScreenAdapter } from '@/ui/admin/editor-shell/EditorScreen'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { portableTextBodySchema } from '@/shared/pt/schema'
import { EMPTY_PAGE_META_DRAFT, pageMetaDraftsEqual } from '@/shared/types/pages'
import { EditorScreen } from '@/ui/admin/editor-shell/EditorScreen'
import { buildPageUpsertPayload } from '@/ui/admin/pages/build-page-upsert-payload'
import { metaDraftFromPage, MetaSidebar } from '@/ui/admin/pages/MetaSidebar'

export interface PageEditorShellProps {
  mode: 'create' | 'edit'
  detail?: AdminPageDetailDto
  navigate: NavigateFunction
}

const PAGE_LOCAL_DRAFT_CONFIG = {
  keyPrefix: 'cms-page-draft:',
  broadcastName: 'cms-page-draft',
  editType: 'page-edit' as const,
  bodySchema: portableTextBodySchema,
}

const PAGE_CREATE_DRAFT_CONFIG = {
  keyPrefix: 'cms-page-draft:new:',
  sessionKey: 'cms-page-draft:new:session',
  broadcastName: 'cms-page-draft',
  createType: 'page-create' as const,
  editType: 'page-edit' as const,
  editKeyPrefix: 'cms-page-draft:',
  bodySchema: portableTextBodySchema,
}

// Module-level DTO accessors — stable identities so the screen's memoized
// detail object only recomputes when the loader DTO itself changes.
const getEntity = (d: AdminPageDetailDto) => d.page
const getLatestRevision = (d: AdminPageDetailDto) => d.latestRevision
const getPublishedRevision = (d: AdminPageDetailDto) => d.publishedRevision

// Thin page binding over the shared `EditorScreen`: DTO accessors, draft
// configs, wire calls (with admin-list cache invalidation), and the page
// meta sidebar. All screen structure + shared state live in `editor-shell`.
export function PageEditorShell({ mode, detail, navigate }: PageEditorShellProps) {
  const queryClient = useQueryClient()

  const invalidateList = () => {
    // The admin list lives in the TanStack cache (useInfiniteQuery in
    // PagesView) — invalidate the namespace so a meta save (including the
    // create flow) is reflected when the user returns to the list.
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.pages.list.key() })
  }

  const adapter: EditorScreenAdapter<
    PageMetaDraft,
    AdminPageDetailDto['page'],
    AdminPageDetailDto,
    UpsertPageMetaInput
  > = {
    entityKind: 'page',
    entityLabel: '页面',
    listPath: '/admin/pages',
    bannerBasePath: '',
    publicPath: (slug) => `/${slug}`,
    editPath: (id) => `/editor/page/${id}`,

    getEntity,
    getLatestRevision,
    getPublishedRevision,

    emptyMeta: EMPTY_PAGE_META_DRAFT,
    metaDraftFromEntity: metaDraftFromPage,
    metaDraftsEqual: pageMetaDraftsEqual,
    localDraftConfig: PAGE_LOCAL_DRAFT_CONFIG,
    createDraftConfig: PAGE_CREATE_DRAFT_CONFIG,

    upsertMetaFn: async (input) => {
      const result = await orpc.admin.pages.upsertMeta(input)
      invalidateList()
      return result.page
    },
    saveDraftFn: (input) => orpc.admin.pages.saveDraft(input),
    publishFn: async (input) => {
      const result = await orpc.admin.pages.publishLatest(input)
      invalidateList()
      return result
    },
    unpublishFn: async (input) => {
      const result = await orpc.admin.pages.unpublish(input)
      invalidateList()
      return result.page
    },
    buildUpsertMetaPayload: buildPageUpsertPayload,
    directSaveDraft: (input) => orpc.admin.pages.saveDraft(input),

    deleteEntityFn: (id) => orpc.admin.pages.delete({ id }),
    restoreEntityFn: (id) => orpc.admin.pages.restore({ id }),
    invalidateList,

    renderMetaSidebar: (props) => <MetaSidebar {...props} />,
  }

  return <EditorScreen mode={mode} detail={detail} navigate={navigate} adapter={adapter} />
}
