// The update-scan registration policy — the shared "scan the document on
// each non-history update" gate for plugins that react to typing by
// rewriting the just-typed content: EmEnDashPlugin's dash replacement and
// HorizontalRulePlugin's '---' divider shortcut. Both used to hand-roll the
// same registerUpdateListener preamble and the copies already drifted once
// (the HR copy originally lacked the history-tag skip, so undoing the HR
// creation re-fired the scan and resurrected the card). This module owns
// the gate so it cannot drift again; each caller keeps only its scan body
// and the two knobs below.
//
// The gate itself, three pure skips (their order is unobservable):
//
// 1. **History-tag skip** — the undo-resurrection guard. Undo/redo commits
//    ('historic') restore the pre-scan text (raw '---' / raw dashes), and
//    that restored content matches the scan's trigger again: without this
//    skip the scan re-fires on the undo commit and resurrects the very
//    replacement the user just undid (pinned in
//    test/unit/plugins/HorizontalRulePlugin.test.tsx). 'history-push' and
//    'history-merge' are skipped for the same reason, and skipping
//    'history-push' additionally keeps a caller's own tagged scan commit
//    (EmEnDash's) from re-triggering its scan.
// 2. **Composing skip** — never rewrite text mid-IME-composition.
// 3. **Empty-dirty skip** — a commit that dirtied nothing (selection-only,
//    no-op) cannot have produced new trigger text; the `dirty` knob picks
//    which dirty sets count.
//
// The two sanctioned knobs — every other divergence stays with the caller:
//
// - `dirty`: 'leaves' when only dirty text/leaf nodes can carry the trigger
//   (EmEnDash rewrites dashes in text nodes), 'leaves-or-elements' when an
//   element-only change could matter (HR's matching paragraph is an
//   element). HR's own comment pins the corner this changes: a '---'
//   paragraph that already matched before the listener registered (pre-loaded
//   content, late mount) does not convert on a mere click into it — it
//   converts after the next edit.
// - `tag`: the update tag for the nested scan commit, when the commit needs
//   one. EmEnDash commits with 'history-push' so the replacement becomes a
//   separate history entry from the keystroke that triggered it and undo
//   restores the raw typed dashes. HR commits untagged, so its conversion
//   merges with the typing.
//
// Composing-check placement, normalized: EmEnDash always checked
// `editor.isComposing()` in the listener before scheduling its scan commit;
// HR checked it inside the scan commit. Both placements read the same value.
// Update listeners run inside $commitPendingUpdates and a listener-scheduled
// update flushes synchronously at the tail of the same commit (Lexical's
// $triggerEnqueuedUpdates), so no compositionstart/end event — a separate
// task — can interleave and flip the flag between the two read points. The
// only residual difference was HR committing a no-op update during
// composition (empty dirty sets, untagged), which every update listener —
// Lexical's history included — guards against. The check therefore lives
// here, once, at listener time.

import {
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type UpdateListenerPayload,
} from 'lexical'

export type UpdateScanDirtyMode = 'leaves' | 'leaves-or-elements'

export interface UpdateScanOptions {
  // which dirty sets must be non-empty for the scan to fire
  dirty: UpdateScanDirtyMode
  // update tag for the nested scan commit; omit for an untagged commit
  tag?: string
  // the caller's scan body, run inside the nested editor.update
  scan: (
    dirtyLeaves: UpdateListenerPayload['dirtyLeaves'],
    dirtyElements: UpdateListenerPayload['dirtyElements'],
  ) => void
}

// Register `scan` to run on each non-history, non-composing update that
// dirtied the sets named by `dirty`. The scan body runs inside a nested
// editor.update scheduled from the listener (tagged when `tag` is given).
// Returns the unregister callback.
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
