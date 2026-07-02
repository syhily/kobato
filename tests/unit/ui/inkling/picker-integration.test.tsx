// @vitest-environment happy-dom

// Integration test for the admin picker glue (`useEditorPickerActions`):
// the pickers themselves are mocked out; what is under test is the hook's
// wiring — it must locate the node-selected card in the editor (the state
// `$insertBlockCard` leaves behind after a slash/plus-menu insertion) and
// write the picked DTO's fields onto it through the card node setters.

import type { LexicalEditor } from 'lexical'
import type { RefObject } from 'react'

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AdminImageDto } from '@/shared/types/images'
import type { AdminMusicDto } from '@/shared/types/music'
import type { InklingArticleEditorActions } from '@/ui/inkling/editor/article/article-editor-context'

import { buildHeadlessArticleEditor, seedParagraph } from '#/_helpers/headless-editor'
import { useEditorPickerActions } from '@/ui/admin/editor/use-inkling-picker-actions'
import { $insertBlockCard } from '@/ui/inkling/editor/cards/card-registry'
import { $createImageCardNode, $createMusicCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'
import { editorStateToInklingDocument } from '@/ui/inkling/editor/serialize'

interface CapturedPickerProps<TDto> {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (dto: TDto) => void
}

const captured = vi.hoisted(() => ({
  image: null as CapturedPickerProps<unknown> | null,
  music: null as CapturedPickerProps<unknown> | null,
}))

// The real pickers pull in admin query hooks + dialog chrome; the hook only
// needs their `open`/`onPick` contract, so capture the props and render
// nothing.
vi.mock('@/ui/admin/editor/pickers/ImageLibraryPicker', () => ({
  ImageLibraryPicker: (props: CapturedPickerProps<unknown>) => {
    captured.image = props
    return null
  },
}))
vi.mock('@/ui/admin/editor/pickers/MusicPickerDialog', () => ({
  MusicPickerDialog: (props: CapturedPickerProps<unknown>) => {
    captured.music = props
    return null
  },
}))

function Harness({
  editorRef,
  actionsOut,
}: {
  editorRef: RefObject<LexicalEditor | null>
  actionsOut: { current: InklingArticleEditorActions | null }
}) {
  const { actions, renderPickers } = useEditorPickerActions(editorRef)
  actionsOut.current = actions
  return renderPickers()
}

function mountPickerHarness(editor: LexicalEditor) {
  const editorRef: RefObject<LexicalEditor | null> = { current: editor }
  const actionsOut: { current: InklingArticleEditorActions | null } = { current: null }
  render(<Harness editorRef={editorRef} actionsOut={actionsOut} />)
  return actionsOut
}

/** Force Lexical's microtask-batched commit (the pick handlers run a
 *  non-discrete `editor.update`). */
function flushEditor(editor: LexicalEditor): void {
  editor.update(() => undefined, { discrete: true })
}

const mockImage = {
  id: 'img-1',
  publicUrl: 'https://cdn.example.com/photo.webp',
  storagePath: 'images/photo.webp',
  width: 1200,
  height: 800,
  thumbhash: 'abc123',
  note: '一张漂亮的照片',
} as AdminImageDto

const mockMusic = {
  id: 'music-1',
  playerId: 'netease-456',
} as AdminMusicDto

describe('ui/admin/editor/use-inkling-picker-actions', () => {
  it('opens the pickers through the injected editor actions', () => {
    const editor = buildHeadlessArticleEditor()
    const actionsOut = mountPickerHarness(editor)

    expect(captured.image?.open).toBe(false)
    expect(captured.music?.open).toBe(false)

    act(() => {
      actionsOut.current?.openImagePicker?.()
    })
    expect(captured.image?.open).toBe(true)

    act(() => {
      actionsOut.current?.openMusicPicker?.()
    })
    expect(captured.music?.open).toBe(true)
  })

  it('writes the picked image onto the node-selected ImageCardNode', () => {
    const editor = buildHeadlessArticleEditor()
    mountPickerHarness(editor)

    // Insert an empty image card the way the card menu does — this leaves a
    // NodeSelection on the card, which is what the pick handler resolves.
    editor.update(
      () => {
        $insertBlockCard(() => $createImageCardNode({ src: '', alt: '', caption: '', layout: 'center' }))
      },
      { discrete: true },
    )

    act(() => {
      captured.image?.onPick(mockImage)
    })
    flushEditor(editor)

    const document = editorStateToInklingDocument(editor.getEditorState())
    const imageNode = document.root.children.find((child) => child.type === 'image-card')
    expect(imageNode?.type).toBe('image-card')
    if (imageNode?.type === 'image-card') {
      expect(imageNode.src).toBe('https://cdn.example.com/photo.webp')
      expect(imageNode.alt).toBe('一张漂亮的照片')
      expect(imageNode.width).toBe(1200)
      expect(imageNode.height).toBe(800)
      expect(imageNode.thumbhash).toBe('abc123')
      expect(imageNode.storagePath).toBe('images/photo.webp')
      expect(imageNode.imageId).toBe('img-1')
    }
  })

  it('writes the picked music playerId onto the node-selected MusicCardNode', () => {
    const editor = buildHeadlessArticleEditor()
    mountPickerHarness(editor)

    editor.update(
      () => {
        $insertBlockCard(() => $createMusicCardNode({ playerId: '__pending__' }))
      },
      { discrete: true },
    )

    act(() => {
      captured.music?.onPick(mockMusic)
    })
    flushEditor(editor)

    const document = editorStateToInklingDocument(editor.getEditorState())
    const musicNode = document.root.children.find((child) => child.type === 'music-card')
    expect(musicNode?.type).toBe('music-card')
    if (musicNode?.type === 'music-card') {
      expect(musicNode.playerId).toBe('netease-456')
    }
  })

  it('ignores a pick when no card is node-selected', () => {
    const editor = buildHeadlessArticleEditor()
    mountPickerHarness(editor)

    // A plain paragraph without a NodeSelection — the pick must be a no-op.
    seedParagraph(editor, '没有选中任何卡片')

    act(() => {
      captured.image?.onPick(mockImage)
      captured.music?.onPick(mockMusic)
    })
    flushEditor(editor)

    const document = editorStateToInklingDocument(editor.getEditorState())
    expect(document.root.children).toHaveLength(1)
    expect(document.root.children[0]?.type).toBe('paragraph')
  })
})
