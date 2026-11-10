// Shared "scan the document on each non-history update" gate for plugins that
// rewrite just-typed content (EmEnDash dashes, HorizontalRule's '---').
//
// Three skips, in unobservable order:
//
// 1. History tags (HISTORIC/HISTORY_PUSH/HISTORY_MERGE) — the undo-resurrection
//    guard: undo restores the pre-scan text, which matches the trigger again, so
//    without this skip the scan re-fires and resurrects the replacement the user
//    just undid. Skipping 'history-push' also keeps a caller's own tagged scan
//    commit from re-triggering its scan.
// 2. Composing — never rewrite text mid-IME-composition. Checked at listener time:
//    a listener-scheduled update flushes inside the same commit, so no
//    compositionstart/end can flip the flag between read points.
// 3. Empty dirty sets — a selection-only commit cannot have produced new trigger
//    text; `dirty` picks which sets count ('leaves' when only text/leaf changes
//    can carry the trigger, 'leaves-or-elements' when an element-only change can,
//    as for HR's matching paragraph).

import {
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type UpdateListenerPayload,
} from 'lexical'

export type UpdateScanDirtyMode = 'leaves' | 'leaves-or-elements'

export interface UpdateScanOptions {
  dirty: UpdateScanDirtyMode
  // Update tag for the nested scan commit; omit to merge with the typing commit.
  tag?: string
  scan: (
    dirtyLeaves: UpdateListenerPayload['dirtyLeaves'],
    dirtyElements: UpdateListenerPayload['dirtyElements'],
  ) => void
}

// Register `scan` to run on each non-history, non-composing update that dirtied
// the sets named by `dirty`. Returns the unregister callback.
export function registerUpdateScan(editor: LexicalEditor, { dirty, tag, scan }: UpdateScanOptions): () => void {
  return editor.registerUpdateListener(({ dirtyLeaves, dirtyElements, tags }) => {
    if (tags.has(HISTORIC_TAG) || tags.has(HISTORY_PUSH_TAG) || tags.has(HISTORY_MERGE_TAG)) {
      return
    }

    if (editor.isComposing()) {
      return
    }

    const hasDirtyTrigger = dirty === 'leaves' ? dirtyLeaves.size > 0 : dirtyLeaves.size > 0 || dirtyElements.size > 0
    if (!hasDirtyTrigger) {
      return
    }

    if (tag === undefined) {
      editor.update(() => scan(dirtyLeaves, dirtyElements))
    } else {
      editor.update(() => scan(dirtyLeaves, dirtyElements), { tag })
    }
  })
}
