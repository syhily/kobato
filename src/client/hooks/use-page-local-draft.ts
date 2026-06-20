/**
 * @deprecated Legacy PortableText draft hook.  Page local drafts are now
 * persisted in Inkling format via v2 draft configs defined inline in
 * PageEditorShell.  This wrapper is retained only for reference; it has
 * zero importers and will be deleted in P9 cleanup.  Do NOT use for new code.
 */
import type { PortableTextBody } from '@/shared/pt/schema'

import { useLocalDraft, type StoredDraft } from '@/client/hooks/use-local-draft'
import { portableTextBodySchema } from '@/shared/pt/schema'

const PAGE_CONFIG = {
  keyPrefix: 'cms-page-draft:',
  broadcastName: 'cms-page-draft',
  editType: 'page-edit' as const,
  bodySchema: portableTextBodySchema,
}

export interface UsePageLocalDraftOptions {
  pageId: string | null
  clientRevisionToken: string | null
  body: PortableTextBody
  disabled?: boolean
}

export interface UsePageLocalDraftResult {
  loadedDraft: StoredDraft<PortableTextBody> | null
  clearDraft: () => void
}

export function usePageLocalDraft({
  pageId,
  clientRevisionToken,
  body,
  disabled = false,
}: UsePageLocalDraftOptions): UsePageLocalDraftResult {
  return useLocalDraft<PortableTextBody>(PAGE_CONFIG, {
    entityId: pageId,
    clientRevisionToken,
    body,
    disabled,
  })
}
