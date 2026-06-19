import type { SerializedEditorState, SerializedRootNode } from 'lexical'

import { describe, expect, it } from 'vitest'

import { probeHeadlessEditorState } from '@/server/domains/inkling/poc/headless-runtime-probe'

function buildBasicEditorState(): SerializedEditorState {
  const root = {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        children: [
          {
            type: 'text',
            version: 1,
            text: 'Hello headless Inkling',
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
          },
        ],
      },
      {
        type: 'poc-card',
        version: 1,
      },
    ],
  } as SerializedRootNode
  return { root }
}

describe('server/domains/inkling/poc/headless-runtime-probe', () => {
  it('returns expected plain text and node count for a basic document', () => {
    const editorState = buildBasicEditorState()
    const result = probeHeadlessEditorState(editorState)

    expect(result.textContent.trim()).toBe('Hello headless Inkling')
    expect(result.nodeCount).toBe(2)
  })

  it('rejects an unknown malformed serialized state with a controlled error', () => {
    const malformedRoot: SerializedRootNode = {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [{ type: 'unknown-node-type', version: 1 }],
    } as unknown as SerializedRootNode
    const malformedState: SerializedEditorState = { root: malformedRoot }

    expect(() => probeHeadlessEditorState(malformedState)).toThrow()
  })
})
