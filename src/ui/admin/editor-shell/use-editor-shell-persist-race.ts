// The owned revision-race slice of the persist module: the expected
// client-revision token plus the latest/published revisions advance ONLY
// through `updateAfterSave`, and the `server` leg of the autosave freeze
// rides the same race — set on a revision conflict, cleared by the next
// clean body save.

import { useCallback, useState } from 'react'

import type { EditorShellDetail, EntityLike, RevisionLike } from '@/ui/admin/editor-shell/editor-shell-types'

import { deriveBaselineRevision } from '@/ui/admin/editor-shell/editor-shell-derived'

export function useEditorShellPersistRace<TEntity extends EntityLike>(detail: EditorShellDetail<TEntity> | undefined) {
  const [expectedToken, setExpectedToken] = useState<string | null>(
    deriveBaselineRevision(detail)?.clientRevisionToken ?? null,
  )
  const [latestRevision, setLatestRevision] = useState<RevisionLike | null>(detail?.latestRevision ?? null)
  const [publishedRevision, setPublishedRevision] = useState<RevisionLike | null>(detail?.publishedRevision ?? null)
  // The `server` leg of the autosave freeze — set on a revision conflict,
  // cleared by the next clean body save (`updateAfterSave`).
  const [serverConflicted, setServerConflicted] = useState(false)

  // The one advance of the owned revision race: token + latest/published,
  // and a clean body save also clears the `server` freeze leg.
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
