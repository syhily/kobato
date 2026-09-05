import { LinkNode } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { act, render, waitFor } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  HISTORY_PUSH_TAG,
  UNDO_COMMAND,
  type LexicalEditor,
  type SerializedEditorState,
} from 'lexical'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import InklingComposableEditor from '@/components/InklingComposableEditor'
import InklingComposer from '@/components/InklingComposer'
import InklingNestedComposer from '@/components/InklingNestedComposer'
import InklingSurface from '@/components/InklingSurface'
import { useSharedEditorStateContext, type SharedEditorStateContextValue } from '@/context/SharedEditorStateContext'
import { ExtendedTextNode, extendedTextNodeReplacement, TKNode } from '@/nodes/base'

const NESTED_NODES = [ExtendedTextNode, extendedTextNodeReplacement, TKNode, LinkNode]

let topEditor: LexicalEditor | undefined
let topSharedState: SharedEditorStateContextValue | undefined
let nestedSharedState: SharedEditorStateContextValue | undefined

function TopEditorProbe() {
  topEditor = useLexicalComposerContext()[0]
  topSharedState = useSharedEditorStateContext()
  return null
}

function NestedSharedStateProbe() {
  nestedSharedState = useSharedEditorStateContext()
  return null
}

function createNestedEditor() {
  return createEditor({ namespace: 'nested', nodes: NESTED_NODES, onError: () => {} })
}

async function setText(editor: LexicalEditor, text: string) {
  // discrete commits synchronously; the push tag stops Lexical history
  // from merging edits made within its merge-delay window
  await updateEditor(
    editor,
    () => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode().append($createTextNode(text)))
    },
    { discrete: true, tag: HISTORY_PUSH_TAG },
  )
}

function getText(editor: LexicalEditor) {
  return editor.getEditorState().read(() => $getRoot().getTextContent())
}

// The composition rule pinned at runtime: a custom surface composed through
// InklingSurface gets the shipped surfaces' shared state — one undo stack
// across top-level and nested editors, and an onChange that always serializes
// the top-level document. The bare harness is the contrast: with no surface,
// each composable editor falls back to a per-instance history state.
function SurfaceHarness({
  nestedEditor,
  onChange,
}: {
  nestedEditor: LexicalEditor
  onChange: (editorState: SerializedEditorState) => void
}) {
  return (
    <InklingComposer>
      <InklingSurface onChange={onChange} placeholderText="top level">
        <TopEditorProbe />
        <InklingNestedComposer initialEditor={nestedEditor}>
          <InklingComposableEditor markdownTransformers={[]} placeholderText="nested">
            <NestedSharedStateProbe />
          </InklingComposableEditor>
        </InklingNestedComposer>
      </InklingSurface>
    </InklingComposer>
  )
}

function BareHarness({ nestedEditor }: { nestedEditor: LexicalEditor }) {
  return (
    <InklingComposer>
      <InklingComposableEditor placeholderText="top level">
        <TopEditorProbe />
        <InklingNestedComposer initialEditor={nestedEditor}>
          <InklingComposableEditor markdownTransformers={[]} placeholderText="nested">
            <NestedSharedStateProbe />
          </InklingComposableEditor>
        </InklingNestedComposer>
      </InklingComposableEditor>
    </InklingComposer>
  )
}

describe('InklingSurface', () => {
  it('routes nested-editor changes to the shared onChange as the top-level document', async () => {
    const nestedEditor = createNestedEditor()
    await setText(nestedEditor, 'nested content')
    const onChange = vi.fn<(editorState: SerializedEditorState) => void>()

    render(<SurfaceHarness nestedEditor={nestedEditor} onChange={onChange} />)

    await setText(nestedEditor, 'nested content edited')

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    // the payload is the top-level editor's document (which the nested edit is
    // not part of), not the nested editor's own state
    const payload = onChange.mock.calls.at(-1)![0]
    expect(payload).toEqual(topEditor!.getEditorState().toJSON())
    expect(JSON.stringify(payload)).not.toContain('nested content edited')
    expect(getText(nestedEditor)).toBe('nested content edited')
  })

  it('shares one history state across top-level and nested editors, so nested edits join the top-level undo stack', async () => {
    const nestedEditor = createNestedEditor()
    await setText(nestedEditor, 'nested content')

    render(<SurfaceHarness nestedEditor={nestedEditor} onChange={() => {}} />)

    // both levels consume the surface-provided value, not per-instance fallbacks
    expect(topSharedState).toBeDefined()
    expect(nestedSharedState).toBeDefined()
    expect(nestedSharedState!.historyState).toBe(topSharedState!.historyState)

    await setText(nestedEditor, 'nested content edited')

    // the nested edit landed on the shared (top-level) undo stack
    const undoStack = topSharedState!.historyState.undoStack as { editor: LexicalEditor }[]
    expect(undoStack.length).toBeGreaterThan(0)
    expect(undoStack.at(-1)!.editor).toBe(nestedEditor)
  })

  it('falls back to per-instance history states when composed without a surface', async () => {
    const nestedEditor = createNestedEditor()
    await setText(nestedEditor, 'nested content')

    render(<BareHarness nestedEditor={nestedEditor} />)

    // each composable editor created its own fallback state, so the probes see
    // distinct objects (the composable editors' own fallbacks are likewise
    // per-instance — the undo behaviour below is what pins it)
    expect(nestedSharedState!.historyState).not.toBe(topSharedState!.historyState)

    await setText(nestedEditor, 'first edit')
    await setText(nestedEditor, 'second edit')

    // an undo dispatched at the top level cannot reach the nested editor
    act(() => {
      topEditor!.dispatchCommand(UNDO_COMMAND, undefined)
    })
    expect(getText(nestedEditor)).toBe('second edit')

    // the nested editor's own fallback history undoes its edit
    act(() => {
      nestedEditor.dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(getText(nestedEditor)).toBe('first edit')
    })
  })
})
