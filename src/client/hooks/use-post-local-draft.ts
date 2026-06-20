/**
 * @deprecated Legacy PortableText draft hook.  Post local drafts are now
 * persisted in Inkling format via v2 draft configs defined inline in
 * PostEditorShell.  This wrapper is retained only for reference; it has
 * zero importers and will be deleted in P9 cleanup.  Do NOT use for new code.
 */
import type { PortableTextBody } from '@/shared/pt/schema'

import { useLocalDraft, type StoredDraft } from '@/client/hooks/use-local-draft'
import { portableTextBodySchema } from '@/shared/pt/schema'

const POST_CONFIG = {
  keyPrefix: 'cms-post-draft:',
  broadcastName: 'cms-post-draft',
  editType: 'post-edit' as const,
  bodySchema: portableTextBodySchema,
}

export interface UsePostLocalDraftOptions {
  postId: string | null
  clientRevisionToken: string | null
  body: PortableTextBody
  disabled?: boolean
}

export interface UsePostLocalDraftResult {
  loadedDraft: StoredDraft<PortableTextBody> | null
  clearDraft: () => void
}

export function usePostLocalDraft({
  postId,
  clientRevisionToken,
  body,
  disabled = false,
}: UsePostLocalDraftOptions): UsePostLocalDraftResult {
  return useLocalDraft<PortableTextBody>(POST_CONFIG, {
    entityId: postId,
    clientRevisionToken,
    body,
    disabled,
  })
}
