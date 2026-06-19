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
