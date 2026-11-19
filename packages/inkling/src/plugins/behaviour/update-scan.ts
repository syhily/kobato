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
  tag?: string
  scan: (
    dirtyLeaves: UpdateListenerPayload['dirtyLeaves'],
    dirtyElements: UpdateListenerPayload['dirtyElements'],
  ) => void
}

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
