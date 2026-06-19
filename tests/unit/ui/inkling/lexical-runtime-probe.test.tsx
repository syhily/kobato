import type { SerializedEditorState, SerializedRootNode } from 'lexical'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { LexicalRuntimeProbe } from '@/ui/inkling/poc/LexicalRuntimeProbe'

function buildProbeEditorState(): SerializedEditorState {
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
            text: 'Hello Inkling',
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

describe('ui/inkling/poc/LexicalRuntimeProbe', () => {
  it('renders without throwing', () => {
    const onChange = vi.fn()
    const initialEditorState = buildProbeEditorState()

    expect(() => {
      renderToStaticMarkup(
        createElement(LexicalRuntimeProbe, {
          initialEditorState,
          onChange,
        }),
      )
    }).not.toThrow()
  })

  it('serializes a document containing a paragraph and the custom card node', () => {
    const onChange = vi.fn()
    const initialEditorState = buildProbeEditorState()

    const html = renderToStaticMarkup(
      createElement(LexicalRuntimeProbe, {
        initialEditorState,
        onChange,
      }),
    )

    expect(html).toContain('inkling-runtime-probe')
    expect(html).toContain('inkling-content-editable')

    const root = initialEditorState.root
    expect(root.type).toBe('root')
    expect(root.children).toHaveLength(2)
    expect(root.children[0].type).toBe('paragraph')
    expect(root.children[1].type).toBe('poc-card')
  })
})
