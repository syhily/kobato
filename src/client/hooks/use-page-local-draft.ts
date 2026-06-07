import type { PortableTextBody } from '@/shared/pt/schema'

import { useLocalDraft, type StoredDraft } from '@/client/hooks/use-local-draft'

const PAGE_CONFIG = {
  keyPrefix: 'cms-page-draft:',
  broadcastName: 'cms-page-draft',
  editType: 'page-edit' as const,
}

export interface UsePageLocalDraftOptions {
  pageId: string | null
  clientRevisionToken: string | null
  body: PortableTextBody
  disabled?: boolean
}

export interface UsePageLocalDraftResult {
  loadedDraft: StoredDraft | null
  clearDraft: () => void
}

export function usePageLocalDraft({
  pageId,
  clientRevisionToken,
  body,
  disabled = false,
}: UsePageLocalDraftOptions): UsePageLocalDraftResult {
  return useLocalDraft(PAGE_CONFIG, {
    entityId: pageId,
    clientRevisionToken,
    body,
    disabled,
  })
}

export type { StoredDraft }
