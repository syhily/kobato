import type { EditorShellDetail, EntityLike, RevisionLike } from '@kobato/web-admin/ui/editor-shell/editor-shell-types'

import { deriveBaselineRevision } from '@kobato/web-admin/ui/editor-shell/editor-shell-derived'
import { useCallback, useState } from 'react'

export function useEditorShellPersistRace<TEntity extends EntityLike>(detail: EditorShellDetail<TEntity> | undefined) {
  const [expectedToken, setExpectedToken] = useState<string | null>(
    deriveBaselineRevision(detail)?.clientRevisionToken ?? null,
  )
  const [latestRevision, setLatestRevision] = useState<RevisionLike | null>(detail?.latestRevision ?? null)
  const [publishedRevision, setPublishedRevision] = useState<RevisionLike | null>(detail?.publishedRevision ?? null)
  const [serverConflicted, setServerConflicted] = useState(false)

  const updateAfterSave = useCallback((revision: RevisionLike) => {
    setServerConflicted(false)
    setExpectedToken(revision.clientRevisionToken)
    setLatestRevision(revision)
    if (revision.status === 'published') {
      setPublishedRevision(revision)
    }
  }, [])

  const noteServerConflict = useCallback(() => setServerConflicted(true), [])

  return { expectedToken, latestRevision, publishedRevision, serverConflicted, updateAfterSave, noteServerConflict }
}
