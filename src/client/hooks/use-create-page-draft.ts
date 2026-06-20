/**
 * @deprecated Legacy PortableText draft hook.  Page drafts are now persisted
 * in Inkling format via v2 draft configs defined inline in PageEditorShell.
 * This wrapper is retained only for reference; it has zero importers and
 * will be deleted in P9 cleanup.  Do NOT use for new code.
 */
import type { PortableTextBody } from '@/shared/pt/schema'
import type { PageMetaDraft } from '@/shared/types/pages'

import { useCreateDraft } from '@/client/hooks/use-create-draft'
import { portableTextBodySchema } from '@/shared/pt/schema'

const PAGE_CREATE_CONFIG = {
  keyPrefix: 'cms-page-draft:new:',
  sessionKey: 'cms-page-draft:new:session',
  broadcastName: 'cms-page-draft',
  createType: 'page-create' as const,
  editType: 'page-edit' as const,
  editKeyPrefix: 'cms-page-draft:',
  bodySchema: portableTextBodySchema,
}

export type CreateDraftMeta = PageMetaDraft

export interface UseCreatePageDraftOptions {
  body: PortableTextBody
  meta: PageMetaDraft
}

export interface UseCreatePageDraftResult {
  sessionId: string
  loadedDraft: { body: PortableTextBody; meta: PageMetaDraft; savedAt: number } | null
  migrateToEditKey: (pageId: string, clientRevisionToken: string, body: PortableTextBody) => void
  clearDraft: () => void
}

export function useCreatePageDraft({ body, meta }: UseCreatePageDraftOptions): UseCreatePageDraftResult {
  return useCreateDraft<PortableTextBody, PageMetaDraft>(PAGE_CREATE_CONFIG, { body, meta })
}
