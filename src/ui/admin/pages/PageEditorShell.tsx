import type { NavigateFunction } from 'react-router'

import { useQueryClient } from '@tanstack/react-query'

import type { AdminPageDetailDto, AdminPageDto } from '@/shared/contracts/pages'
import type { PageMetaDraft, UpsertPageMetaInput, UpsertPageMetaOutput } from '@/shared/types/pages'
import type { EditorAdapterConfig } from '@/ui/admin/editor-shell/make-editor-adapter'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { portableTextBodySchema } from '@/shared/pt/schema'
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
    bodySchema: portableTextBodySchema,
  },
  createDraftConfig: {
    keyPrefix: 'cms-page-draft:new:',
    sessionKey: 'cms-page-draft:new:session',
    broadcastName: 'cms-page-draft',
    createType: 'page-create',
    editType: 'page-edit',
    editKeyPrefix: 'cms-page-draft:',
    bodySchema: portableTextBodySchema,
  },
  buildUpsertMetaPayload: buildPageUpsertPayload,

  api: orpc.admin.pages,
  unwrapEntity: (output) => output.page,
  listQueryKey: () => orpcQuery.admin.pages.list.key(),
}

// Thin page binding over the shared `EditorScreen`: the adapter shape and
// wire wrappers are owned by `make-editor-adapter`; this component only
// supplies the per-render query client and the page meta sidebar.
export function PageEditorShell({ mode, detail, navigate }: PageEditorShellProps) {
  const queryClient = useQueryClient()

  const adapter = makeEditorAdapter(PAGE_EDITOR_ADAPTER_CONFIG, {
    queryClient,
    renderMetaSidebar: (props) => <MetaSidebar {...props} />,
  })

  return <EditorScreen mode={mode} detail={detail} navigate={navigate} adapter={adapter} />
}
