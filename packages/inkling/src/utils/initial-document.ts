import type { InitialEditorStateType, SerializedEditorState, SerializedParagraphNode } from 'lexical'

import { $createParagraphNode, $getRoot } from 'lexical'

const FULL_EMPTY_PARAGRAPH: SerializedParagraphNode = {
  children: [],
  direction: null,
  format: '',
  indent: 0,
  textFormat: 0,
  textStyle: '',
  type: 'paragraph',
  // oxlint-disable-next-line typescript/no-deprecated -- persisted payloads carry version and a live export still emits it; dropping it changes the stored shape
  version: 1,
}

const LEGACY_EMPTY_PARAGRAPH = {
  children: [],
  direction: null,
  format: '',
  indent: 0,
  type: 'paragraph',
  version: 1,
}

export const MINIMAL_DOCUMENT: SerializedEditorState = {
  root: {
    children: [FULL_EMPTY_PARAGRAPH],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    // oxlint-disable-next-line typescript/no-deprecated -- see the note on FULL_EMPTY_PARAGRAPH
    version: 1,
  },
}

export const MINIMAL_DOCUMENT_LEGACY_PAYLOAD = {
  root: {
    children: [LEGACY_EMPTY_PARAGRAPH],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
}

function hasRootChildren(value: unknown): value is { root: { children: unknown[] } } {
  if (typeof value !== 'object' || value === null || !('root' in value)) {
    return false
  }

  const { root } = value
  return typeof root === 'object' && root !== null && 'children' in root && Array.isArray(root.children)
}

function repairSerializedEmptyRoot(value: unknown): boolean {
  if (!hasRootChildren(value) || value.root.children.length > 0) {
    return false
  }

  value.root.children.push({ ...LEGACY_EMPTY_PARAGRAPH })
  return true
}

export function $appendEmptyParagraph(): void {
  $getRoot().append($createParagraphNode())
}

export type InklingInitialEditorState = InitialEditorStateType | SerializedEditorState
export function normalizeInitialEditorState(
  initialEditorState: InklingInitialEditorState | undefined,
): InitialEditorStateType | undefined {
  if (initialEditorState === null || initialEditorState === undefined || typeof initialEditorState === 'function') {
    return initialEditorState
  }
  if (typeof initialEditorState === 'string') {
    const parsed: unknown = JSON.parse(initialEditorState)

    if (repairSerializedEmptyRoot(parsed)) {
      return JSON.stringify(parsed)
    }

    return initialEditorState
  }

  if (!('root' in initialEditorState)) {
    return initialEditorState
  }

  const cloned: unknown = JSON.parse(JSON.stringify(initialEditorState))
  repairSerializedEmptyRoot(cloned)

  return JSON.stringify(cloned)
}
