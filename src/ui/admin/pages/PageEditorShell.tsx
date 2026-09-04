import type { NavigateFunction } from 'react-router'

import { useQueryClient } from '@tanstack/react-query'

import type { AdminPageDetailDto, AdminPageDto } from '@/shared/contracts/pages'
import type { PageMetaDraft, UpsertPageMetaInput, UpsertPageMetaOutput } from '@/shared/types/pages'
import type { EditorAdapterConfig } from '@/ui/admin/editor-shell/make-editor-adapter'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'
import { EMPTY_PAGE_META_DRAFT, pageMetaDraftsEqual } from '@/shared/types/pages'
import { EditorScreen } from '@/ui/admin/editor-shell/EditorScreen'
import { makeEditorAdapter } from '@/ui/admin/editor-shell/make-editor-adapter'
import { buildPageUpsertPayload } from '@/ui/admin/pages/build-page-upsert-payload'
import { metaDraftFromPage, MetaSidebar } from '@/ui/admin/pages/MetaSidebar'

export interface PageEditorShellProps {
  mode: 'create' | 'edit'
  detail?: AdminPageDetailDto
  navigate: NavigateFunction
}

// Module-level accessor — stable identity so the memoized detail only recomputes when the loader DTO changes.
const getEntity = (d: AdminPageDetailDto) => d.page

// Static page binding for the shared editor adapter: nouns, paths, draft
// configs, meta helpers, oRPC namespace; per-render inputs arrive as runtime.
const PAGE_EDITOR_ADAPTER_CONFIG: EditorAdapterConfig<
  PageMetaDraft,
  AdminPageDto,
  AdminPageDetailDto,
  UpsertPageMetaInput,
  UpsertPageMetaOutput
> = {
  entityKind: 'page',
  entityLabel: '页面',
  listPath: '/admin/pages',
  bannerBasePath: '',
  publicPath: (slug) => `/${slug}`,
  editPath: (id) => `/editor/page/${id}`,

  getEntity,

  emptyMeta: EMPTY_PAGE_META_DRAFT,
  metaDraftFromEntity: metaDraftFromPage,
  metaDraftsEqual: pageMetaDraftsEqual,
  localDraftConfig: {
    keyPrefix: 'cms-page-draft:',
    broadcastName: 'cms-page-draft',
    editType: 'page-edit',
    bodySchema: lexicalEditorStateSchema,
  },
  createDraftConfig: {
    keyPrefix: 'cms-page-draft:new:',
    sessionKey: 'cms-page-draft:new:session',
    broadcastName: 'cms-page-draft',
    createType: 'page-create',
    editType: 'page-edit',
    editKeyPrefix: 'cms-page-draft:',
    bodySchema: lexicalEditorStateSchema,
  },
  buildUpsertMetaPayload: buildPageUpsertPayload,

  api: orpc.admin.pages,
  unwrapEntity: (output) => output.page,
  listQueryKey: () => orpcQuery.admin.pages.list.key(),
}

// Thin page binding over `EditorScreen` — adapter shape and wire wrappers are owned by `make-editor-adapter`.
export function PageEditorShell({ mode, detail, navigate }: PageEditorShellProps) {
  const queryClient = useQueryClient()

  const adapter = makeEditorAdapter(PAGE_EDITOR_ADAPTER_CONFIG, {
    queryClient,
    renderMetaSidebar: (props) => <MetaSidebar {...props} />,
  })

  return <EditorScreen mode={mode} detail={detail} navigate={navigate} adapter={adapter} />
}
