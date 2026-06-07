import type { PortableTextBody } from '@/shared/pt/schema'

import { useCreateDraft } from '@/client/hooks/use-create-draft'

const POST_CREATE_CONFIG = {
  keyPrefix: 'cms-post-draft:new:',
  sessionKey: 'cms-post-draft:new:session',
  broadcastName: 'cms-post-draft',
  createType: 'post-create' as const,
  editType: 'post-edit' as const,
  editKeyPrefix: 'cms-post-draft:',
}

export interface CreatePostDraftMeta {
  slug: string
  title: string
  summary: string
  cover: string
  og: string
  published: boolean
  commentsEnabled: boolean
  showToc: boolean
  showUpdated: boolean
  visible: boolean
  pinned: boolean
  category: string
  tags: string[]
  alias: string[]
  publishedAt: string
}

export interface UseCreatePostDraftOptions {
  body: PortableTextBody
  meta: CreatePostDraftMeta
}

export interface UseCreatePostDraftResult {
  sessionId: string
  loadedDraft: { body: PortableTextBody; meta: CreatePostDraftMeta; savedAt: number } | null
  migrateToEditKey: (postId: string, clientRevisionToken: string, body: PortableTextBody) => void
  clearDraft: () => void
}

export function useCreatePostDraft({ body, meta }: UseCreatePostDraftOptions): UseCreatePostDraftResult {
  return useCreateDraft<CreatePostDraftMeta>(POST_CREATE_CONFIG, { body, meta })
}
