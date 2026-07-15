import type { PageMetaDraft } from '@/shared/types/pages'

import { useCreateDraft } from '@/client/hooks/use-create-draft'
import { portableTextBodySchema, type PortableTextBody } from '@/shared/pt/schema'

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
