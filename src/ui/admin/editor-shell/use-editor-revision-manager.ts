import { useState } from 'react'

import type { EntityLike, RevisionLike } from '@/ui/admin/editor-shell/editor-shell-types'

export interface EditorRevisionManager {
  expectedToken: string | null
  latestRevision: RevisionLike | null
  publishedRevision: RevisionLike | null
  updateAfterSave: (revision: RevisionLike) => void
}

export function useEditorRevisionManager<TEntity extends EntityLike>(
  isEditing: boolean,
  detail: { entity: TEntity; latestRevision: RevisionLike | null; publishedRevision: RevisionLike | null } | undefined,
): EditorRevisionManager {
  const [expectedToken, setExpectedToken] = useState<string | null>(
    isEditing ? ((detail!.latestRevision ?? detail!.publishedRevision)?.clientRevisionToken ?? null) : null,
  )
  const [latestRevision, setLatestRevision] = useState<RevisionLike | null>(isEditing ? detail!.latestRevision : null)
  const [publishedRevision, setPublishedRevision] = useState<RevisionLike | null>(
    isEditing ? detail!.publishedRevision : null,
  )

  const updateAfterSave = (revision: RevisionLike) => {
    setExpectedToken(revision.clientRevisionToken)
    setLatestRevision(revision)
    if (revision.status === 'published') {
      setPublishedRevision(revision)
    }
  }

  return { expectedToken, latestRevision, publishedRevision, updateAfterSave }
}
