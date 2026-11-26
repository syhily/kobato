import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { areLexicalEditorStatesEquivalent } from '@kobato/inkling/headless/equivalence'
import { useCallback, useState } from 'react'

import type { LocalDraftConfig } from '@/ui/editor-shell/drafts/use-local-draft'

import { useLocalDraft } from '@/ui/editor-shell/drafts/use-local-draft'

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
