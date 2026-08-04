import type { AdminPageDetailDto, AdminPageDto } from '@kobato/shared/contracts/pages'
import type { PageMetaDraft, UpsertPageMetaInput, UpsertPageMetaOutput } from '@kobato/shared/types/pages'
import type { EditorAdapterConfig } from '@kobato/ui/admin/editor-shell/make-editor-adapter'
import type { NavigateFunction } from 'react-router'

import { orpc } from '@kobato/client/api/client'
import { orpcQuery } from '@kobato/client/api/orpc-query'
import { lexicalBodySchema } from '@kobato/shared/lexical/schema'
import { EMPTY_PAGE_META_DRAFT, pageMetaDraftsEqual } from '@kobato/shared/types/pages'
import { EditorScreen } from '@kobato/ui/admin/editor-shell/EditorScreen'
import { makeEditorAdapter } from '@kobato/ui/admin/editor-shell/make-editor-adapter'
import { buildPageUpsertPayload } from '@kobato/ui/admin/pages/build-page-upsert-payload'
import { metaDraftFromPage, MetaSidebar } from '@kobato/ui/admin/pages/MetaSidebar'
import { useQueryClient } from '@tanstack/react-query'

export interface PageEditorShellProps {
  mode: 'create' | 'edit'
  detail?: AdminPageDetailDto
  navigate: NavigateFunction
  /** Headless public-link face (frontend origin + preview token) — see `EditorAdapterRuntime`. */
  preview?: { frontendUrl: string; token: string | null } | null
}

// Module-level DTO accessor — stable identity so the screen's memoized
// detail object only recomputes when the loader DTO itself changes. The
// entity-independent revision accessors live in `make-editor-adapter`.
const getEntity = (d: AdminPageDetailDto) => d.page

// Static page binding for the shared editor adapter: nouns, paths, draft
// configs, meta helpers, and the oRPC namespace. The per-render inputs
// (query client, meta sidebar) arrive as the runtime argument.
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
    bodySchema: lexicalBodySchema,
  },
  createDraftConfig: {
    keyPrefix: 'cms-page-draft:new:',
    sessionKey: 'cms-page-draft:new:session',
    broadcastName: 'cms-page-draft',
    createType: 'page-create',
    editType: 'page-edit',
    editKeyPrefix: 'cms-page-draft:',
    bodySchema: lexicalBodySchema,
  },
  buildUpsertMetaPayload: buildPageUpsertPayload,

  api: orpc.admin.pages,
  unwrapEntity: (output) => output.page,
  listQueryKey: () => orpcQuery.admin.pages.list.key(),
}

// Thin page binding over the shared `EditorScreen`: the adapter shape and
// wire wrappers are owned by `make-editor-adapter`; this component only
// supplies the per-render query client and the page meta sidebar.
export function PageEditorShell({ mode, detail, navigate, preview }: PageEditorShellProps) {
  const queryClient = useQueryClient()

  const adapter = makeEditorAdapter(PAGE_EDITOR_ADAPTER_CONFIG, {
    queryClient,
    preview,
    renderMetaSidebar: (props) => <MetaSidebar {...props} />,
  })

  return <EditorScreen mode={mode} detail={detail} navigate={navigate} adapter={adapter} />
}
