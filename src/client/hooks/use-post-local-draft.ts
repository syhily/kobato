import type { PortableTextBody } from '@/shared/pt/schema'

import { useLocalDraft, type StoredDraft } from '@/client/hooks/use-local-draft'

const POST_CONFIG = {
  keyPrefix: 'cms-post-draft:',
  broadcastName: 'cms-post-draft',
  editType: 'post-edit' as const,
}

export interface UsePostLocalDraftOptions {
  postId: string | null
  clientRevisionToken: string | null
  body: PortableTextBody
  disabled?: boolean
}

export interface UsePostLocalDraftResult {
  loadedDraft: StoredDraft | null
  clearDraft: () => void
}

export function usePostLocalDraft({
  postId,
  clientRevisionToken,
  body,
  disabled = false,
}: UsePostLocalDraftOptions): UsePostLocalDraftResult {
  return useLocalDraft(POST_CONFIG, {
    entityId: postId,
    clientRevisionToken,
    body,
    disabled,
  })
}

export type { StoredDraft }
