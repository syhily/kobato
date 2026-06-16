import { useState } from 'react'

import type { EditorShellArgs, EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'

export interface EditorMetaState<TMeta> {
  meta: TMeta
  setMeta: React.Dispatch<React.SetStateAction<TMeta>>
  lastPersistedMeta: TMeta
  serverPublishedAtIso: string | null
  setServerPublishedAtIso: React.Dispatch<React.SetStateAction<string | null>>
  resetMeta: (meta: TMeta, publishedAt: string | null) => void
}

export function useEditorMetaState<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
>(
  args: EditorShellArgs<TEntity>,
  emptyMeta: TMeta,
  metaDraftFromEntity: (entity: TEntity) => TMeta,
): EditorMetaState<TMeta> {
  const [meta, setMeta] = useState<TMeta>(args.isEditing ? metaDraftFromEntity(args.detail.entity) : emptyMeta)
  const [lastPersistedMeta, setLastPersistedMeta] = useState<TMeta>(
    args.isEditing ? metaDraftFromEntity(args.detail.entity) : { ...emptyMeta },
  )
  const [serverPublishedAtIso, setServerPublishedAtIso] = useState<string | null>(
    args.isEditing ? args.detail.entity.publishedAt : null,
  )

  const resetMeta = (freshMeta: TMeta, publishedAt: string | null) => {
    setMeta(freshMeta)
    setLastPersistedMeta(freshMeta)
    setServerPublishedAtIso(publishedAt)
  }

  return { meta, setMeta, lastPersistedMeta, serverPublishedAtIso, setServerPublishedAtIso, resetMeta }
}
