import { useState } from 'react'

import type { EditorShellArgs, EntityLike, RevisionLike } from '@/ui/admin/editor-shell/editor-shell-types'

export interface EditorRevisionManager {
  expectedToken: string | null
  latestRevision: RevisionLike | null
  publishedRevision: RevisionLike | null
  updateAfterSave: (revision: RevisionLike) => void
}

export function useEditorRevisionManager<TEntity extends EntityLike>(
  args: EditorShellArgs<TEntity>,
): EditorRevisionManager {
  const [expectedToken, setExpectedToken] = useState<string | null>(
    args.isEditing
      ? ((args.detail.latestRevision ?? args.detail.publishedRevision)?.clientRevisionToken ?? null)
      : null,
  )
  const [latestRevision, setLatestRevision] = useState<RevisionLike | null>(
    args.isEditing ? args.detail.latestRevision : null,
  )
  const [publishedRevision, setPublishedRevision] = useState<RevisionLike | null>(
    args.isEditing ? args.detail.publishedRevision : null,
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
