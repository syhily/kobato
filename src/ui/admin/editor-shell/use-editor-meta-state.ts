import { useState } from 'react'

import type { EditorShellDetail, EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'

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
  detail: EditorShellDetail<TEntity> | undefined,
  emptyMeta: TMeta,
  metaDraftFromEntity: (entity: TEntity) => TMeta,
): EditorMetaState<TMeta> {
  const [meta, setMeta] = useState<TMeta>(detail !== undefined ? metaDraftFromEntity(detail.entity) : emptyMeta)
  const [lastPersistedMeta, setLastPersistedMeta] = useState<TMeta>(
    detail !== undefined ? metaDraftFromEntity(detail.entity) : { ...emptyMeta },
  )
  const [serverPublishedAtIso, setServerPublishedAtIso] = useState<string | null>(
    detail !== undefined ? detail.entity.publishedAt : null,
  )

  const resetMeta = (freshMeta: TMeta, publishedAt: string | null) => {
    setMeta(freshMeta)
    setLastPersistedMeta(freshMeta)
    setServerPublishedAtIso(publishedAt)
  }

  return { meta, setMeta, lastPersistedMeta, serverPublishedAtIso, setServerPublishedAtIso, resetMeta }
}
