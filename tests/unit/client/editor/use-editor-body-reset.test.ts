// @vitest-environment jsdom
// jsdom: the decorator cards (codeblock) in COMMENT_EDITOR_NODES serialize
// through @lexical/html, which needs a DOM document for the parse → toJSON
// round-trip (same rationale as comment-editor-nodes.test.ts).
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { COMMENT_EDITOR_NODES } from '@/client/editor/comment-editor-nodes'
import { useEditorBodyReset } from '@/client/editor/use-editor-body-reset'
import { createHeadlessEditor, type SerializedEditorState } from '@/inkling'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

function commentBody(text: string): CommentEditorState {
  return unsafeCast<CommentEditorState>({
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: [{ type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text }],
        },
      ],
    },
  })
}

function makeEditor() {
  return createHeadlessEditor({
    nodes: COMMENT_EDITOR_NODES,
    onError: (error: Error) => {
      throw error
    },
  })
}

type EditorJson = { root: { children: Array<{ children?: Array<{ text?: string }> }> } }

function editorText(editor: ReturnType<typeof makeEditor>): string {
  const json = unsafeCast<EditorJson>(editor.getEditorState().toJSON())
  return json.root.children[0]?.children?.[0]?.text ?? ''
}

describe('useEditorBodyReset', () => {
  it('pins the mount-time snapshot and never reseeds while bodyKey is stable', () => {
    const editor = makeEditor()
    const setSpy = vi.spyOn(editor, 'setEditorState')
    const onBodyChange = vi.fn()
    const bodyA = commentBody('a')

    const { result, rerender } = renderHook(
      (props: { body: CommentEditorState; bodyKey: string }) =>
        useEditorBodyReset(editor, props.body, props.bodyKey, onBodyChange),
      { initialProps: { body: bodyA, bodyKey: 'k1' } },
    )
    expect(result.current.mountedInitialState).toBe(bodyA)
    expect(setSpy).not.toHaveBeenCalled()

    // An initialBody identity change alone re-runs the effect but early-outs.
    rerender({ body: commentBody('b'), bodyKey: 'k1' })
    expect(setSpy).not.toHaveBeenCalled()
    expect(result.current.mountedInitialState).toBe(bodyA)
  })

  it('reseeds the live editor imperatively when bodyKey changes', () => {
    const editor = makeEditor()
    const onBodyChange = vi.fn()
    const bodyB = commentBody('b')

    const { rerender } = renderHook(
      (props: { body: CommentEditorState; bodyKey: string }) =>
        useEditorBodyReset(editor, props.body, props.bodyKey, onBodyChange),
      { initialProps: { body: commentBody('a'), bodyKey: 'k1' } },
    )
    expect(editorText(editor)).toBe('')

    rerender({ body: bodyB, bodyKey: 'k2' })
    expect(editorText(editor)).toBe('b')
  })

  it('defers the reseed until the editor registers when bodyKey changed earlier', () => {
    const editor = makeEditor()
    const onBodyChange = vi.fn()

    const { rerender } = renderHook(
      (props: { body: CommentEditorState; bodyKey: string; registered: boolean }) =>
        useEditorBodyReset(props.registered ? editor : null, props.body, props.bodyKey, onBodyChange),
      { initialProps: { body: commentBody('a'), bodyKey: 'k1', registered: false } },
    )
    rerender({ body: commentBody('b'), bodyKey: 'k2', registered: false })
    expect(editorText(editor)).toBe('')

    // The editor registers (registerAPI) after the key already changed — the
    // pending reseed fires on registration instead of being dropped.
    rerender({ body: commentBody('b'), bodyKey: 'k2', registered: true })
    expect(editorText(editor)).toBe('b')
  })

  it('emits through a stable handleChange bound to the latest onBodyChange', () => {
    const editor = makeEditor()
    const first = vi.fn()
    const second = vi.fn()

    const { result, rerender } = renderHook(
      (props: { onBodyChange: (body: CommentEditorState) => void }) =>
        useEditorBodyReset(editor, commentBody('a'), 'k1', props.onBodyChange),
      { initialProps: { onBodyChange: first } },
    )
    const handleChange = result.current.handleChange

    rerender({ onBodyChange: second })
    expect(result.current.handleChange).toBe(handleChange)

    const update = commentBody('typed')
    act(() => {
      result.current.handleChange(unsafeCast<SerializedEditorState>(update))
    })
    expect(second).toHaveBeenCalledWith(update)
    expect(first).not.toHaveBeenCalled()
  })

  it('applies prepareSeed to the mount snapshot and to every reseed', () => {
    const editor = makeEditor()
    const onBodyChange = vi.fn()
    const BROKEN = unsafeCast<CommentEditorState>({ root: { type: 'root', version: 1 } })
    const SAFE = commentBody('safe')
    const prepareSeed = (body: CommentEditorState) => (body === BROKEN ? SAFE : body)

    const { result, rerender } = renderHook(
      (props: { body: CommentEditorState; bodyKey: string }) =>
        useEditorBodyReset(editor, props.body, props.bodyKey, onBodyChange, prepareSeed),
      { initialProps: { body: BROKEN, bodyKey: 'k1' } },
    )
    expect(result.current.mountedInitialState).toBe(SAFE)

    rerender({ body: BROKEN, bodyKey: 'k2' })
    expect(editorText(editor)).toBe('safe')
  })
})
