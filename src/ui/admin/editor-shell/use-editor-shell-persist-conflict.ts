// The owned local-draft session + conflict-detection slice of the persist
// module: the IndexedDB draft key embeds the owned revision token, so the
// stored draft rotates with every clean save (audit P1-15), and a stored
// draft diverging from the opening body surfaces as the `local` autosave
// freeze leg until the dialog resolves it.

import { useCallback, useState } from 'react'

import type { LocalDraftConfig } from '@/client/hooks/use-local-draft'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { useLocalDraft } from '@/client/hooks/use-local-draft'
import { areLexicalEditorStatesEquivalent } from '@/shared/lexical/equivalence'

export interface EditorShellLocalConflict {
  localBody: LexicalEditorState
  localSavedAt: number
}

export function useEditorShellPersistConflict(args: {
  localDraftConfig: LocalDraftConfig<LexicalEditorState>
  /** Edit-mode entity id; null in create mode (the session is disabled there). */
  entityId: string | null
  /** The owned revision token — part of the draft key. */
  clientRevisionToken: string | null
  body: LexicalEditorState
  disabled: boolean
  /** Opening body the server holds — the local-conflict baseline. */
  initialBody: LexicalEditorState
}) {
  const { localDraftConfig, entityId, clientRevisionToken, body, disabled, initialBody } = args

  const { loadedDraft: loadedLocalDraft, clearDraft: clearLocalDraft } = useLocalDraft(localDraftConfig, {
    entityId,
    clientRevisionToken,
    body,
    disabled,
  })

  // Owned local-conflict detection (render-phase state adjustment,
  // react-compiler-safe): a stored draft diverging from the opening body
  // freezes autosave until the dialog resolves it.
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

  // The dialog-resolution latch: clears the conflict and pins it resolved so
  // a later identical draft load never re-raises it.
  const resolveConflict = useCallback(() => {
    setConflict(null)
    setConflictResolved(true)
  }, [])

  return { conflict, clearLocalDraft, resolveConflict }
}
