import type { AdminPageDetailDto, AdminPageDto } from '@kobato/contracts/pages.ts'
import type { EditorAdapterConfig } from '@kobato/web/ui/admin/editor-shell/make-editor-adapter.ts'
import type { PageMetaDraft, UpsertPageMetaInput, UpsertPageMetaOutput } from '@kobato/web/ui/admin/pages/page-meta.ts'
import type { NavigateFunction } from 'react-router'

import { lexicalEditorStateSchema } from '@kobato/pt/schema.ts'
import { orpc } from '@kobato/web/client/api/client.ts'
import { orpcQuery } from '@kobato/web/client/api/orpc-query.ts'
import { EditorScreen } from '@kobato/web/ui/admin/editor-shell/EditorScreen.tsx'
import { makeEditorAdapter } from '@kobato/web/ui/admin/editor-shell/make-editor-adapter.ts'
import { buildPageUpsertPayload } from '@kobato/web/ui/admin/pages/build-page-upsert-payload.ts'
import { metaDraftFromPage, MetaSidebar } from '@kobato/web/ui/admin/pages/MetaSidebar.tsx'
import { EMPTY_PAGE_META_DRAFT, pageMetaDraftsEqual } from '@kobato/web/ui/admin/pages/page-meta.ts'
import { useQueryClient } from '@tanstack/react-query'

export interface PageEditorShellProps {
  mode: 'create' | 'edit'
  detail?: AdminPageDetailDto
  navigate: NavigateFunction
}

// Module-level accessor — stable identity so the memoized detail only recomputes when the loader DTO changes.
const getEntity = (d: AdminPageDetailDto) => d.page

// Static page binding for the shared editor adapter: nouns, paths, draft configs, meta helpers, oRPC namespace.
const PAGE_EDITOR_ADAPTER_CONFIG: EditorAdapterConfig<
  PageMetaDraft,
  AdminPageDto,
  AdminPageDetailDto,
  UpsertPageMetaInput,
  UpsertPageMetaOutput
> = {
  entityKind: 'page',
  entityLabelId: 'admin.editor.entity.page',
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

export function PageEditorShell({ mode, detail, navigate }: PageEditorShellProps) {
  const queryClient = useQueryClient()

  const adapter = makeEditorAdapter(PAGE_EDITOR_ADAPTER_CONFIG, {
    queryClient,
    renderMetaSidebar: (props) => <MetaSidebar {...props} />,
  })

  return <EditorScreen mode={mode} detail={detail} navigate={navigate} adapter={adapter} />
}
