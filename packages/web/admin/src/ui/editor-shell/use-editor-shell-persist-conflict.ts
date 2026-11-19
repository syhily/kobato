import type { LexicalEditorState } from '@kobato/lexical/schema.ts'
import type { LocalDraftConfig } from '@kobato/web-admin/ui/editor-shell/drafts/use-local-draft.ts'

import { areLexicalEditorStatesEquivalent } from '@kobato/lexical/equivalence.ts'
import { useLocalDraft } from '@kobato/web-admin/ui/editor-shell/drafts/use-local-draft.ts'
import { useCallback, useState } from 'react'

export interface EditorShellLocalConflict {
  localBody: LexicalEditorState
  localSavedAt: number
}

export function useEditorShellPersistConflict(args: {
  localDraftConfig: LocalDraftConfig<LexicalEditorState>
  entityId: string | null
  clientRevisionToken: string | null
  body: LexicalEditorState
  disabled: boolean
  initialBody: LexicalEditorState
}) {
  const { localDraftConfig, entityId, clientRevisionToken, body, disabled, initialBody } = args

  const { loadedDraft: loadedLocalDraft, clearDraft: clearLocalDraft } = useLocalDraft(localDraftConfig, {
    entityId,
    clientRevisionToken,
    body,
    disabled,
  })

  const [conflict, setConflict] = useState<EditorShellLocalConflict | null>(null)
  const [conflictResolved, setConflictResolved] = useState(false)
  const [lastConflictCheck, setLastConflictCheck] = useState({
    loadedLocalDraft,
    initialBody,
    conflictResolved,
  })
  if (
    lastConflictCheck.loadedLocalDraft !== loadedLocalDraft ||
    lastConflictCheck.initialBody !== initialBody ||
    lastConflictCheck.conflictResolved !== conflictResolved
  ) {
    setLastConflictCheck({ loadedLocalDraft, initialBody, conflictResolved })
    if (
      !conflictResolved &&
      loadedLocalDraft !== null &&
      !areLexicalEditorStatesEquivalent(loadedLocalDraft.body, initialBody)
    ) {
      setConflict({ localBody: loadedLocalDraft.body, localSavedAt: loadedLocalDraft.savedAt })
    }
  }

  const resolveConflict = useCallback(() => {
    setConflict(null)
    setConflictResolved(true)
  }, [])

  return { conflict, clearLocalDraft, resolveConflict }
}
