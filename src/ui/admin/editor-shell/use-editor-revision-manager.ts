import { useState } from 'react'

import type { EditorShellDetail, EntityLike, RevisionLike } from '@/ui/admin/editor-shell/editor-shell-types'

export interface EditorRevisionManager {
  expectedToken: string | null
  latestRevision: RevisionLike | null
  publishedRevision: RevisionLike | null
  updateAfterSave: (revision: RevisionLike) => void
}

export function useEditorRevisionManager<TEntity extends EntityLike>(
  detail: EditorShellDetail<TEntity> | undefined,
): EditorRevisionManager {
  const [expectedToken, setExpectedToken] = useState<string | null>(
    detail !== undefined ? ((detail.latestRevision ?? detail.publishedRevision)?.clientRevisionToken ?? null) : null,
  )
  const [latestRevision, setLatestRevision] = useState<RevisionLike | null>(
    detail !== undefined ? detail.latestRevision : null,
  )
  const [publishedRevision, setPublishedRevision] = useState<RevisionLike | null>(
    detail !== undefined ? detail.publishedRevision : null,
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
