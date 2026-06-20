import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { $getRoot, ParagraphNode } from 'lexical'
import { describe, expect, it } from 'vitest'

import type { InklingDocument } from '@/shared/inkling/schema'
import type { AdminImageDto } from '@/shared/types/images'
import type { AdminMusicDto } from '@/shared/types/music'

import { validateInklingDocument } from '@/shared/inkling/schema'
import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
import {
  $createImageCardNode,
  $createMusicCardNode,
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'

function buildHeadlessArticleEditor() {
  return createHeadlessEditor({
    namespace: 'inkling-picker-integration-test',
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Headless picker integration test error:', error)
    },
    nodes: [
      ParagraphNode,
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      FootnoteRefNode,
      InlineMathNode,
      ImageCardNode,
      CodeCardNode,
      MathCardNode,
      MusicCardNode,
      HorizontalRuleCardNode,
      TableCardNode,
    ],
  })
}

function editorStateToDocument(editorState: { toJSON: () => { root: unknown } }): InklingDocument {
  const serialized = editorState.toJSON()
  return validateInklingDocument({
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: serialized.root as InklingDocument['root'],
  })
}

describe('ui/inkling/editor/picker-integration', () => {
  it('can mock image picker selection and assert card payload', () => {
    const editor = buildHeadlessArticleEditor()
    const mockImage = {
      id: 'img-1',
      publicUrl: 'https://cdn.example.com/photo.webp',
      storagePath: 'images/photo.webp',
      width: 1200,
      height: 800,
      thumbhash: 'abc123',
      note: 'A nice photo',
    } as AdminImageDto

    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append(
          $createImageCardNode({
            src: mockImage.publicUrl,
            alt: mockImage.note ?? '',
            caption: '',
            layout: 'center',
            width: mockImage.width,
            height: mockImage.height,
            thumbhash: mockImage.thumbhash ?? undefined,
            storagePath: mockImage.storagePath,
            imageId: mockImage.id,
          }),
        )
      },
      { discrete: true },
    )

    const document = editorStateToDocument(editor.getEditorState())
    const imageNode = document.root.children[0]
    expect(imageNode?.type).toBe('image-card')
    if (imageNode?.type === 'image-card') {
      expect(imageNode.src).toBe('https://cdn.example.com/photo.webp')
      expect(imageNode.alt).toBe('A nice photo')
      expect(imageNode.width).toBe(1200)
      expect(imageNode.height).toBe(800)
      expect(imageNode.thumbhash).toBe('abc123')
      expect(imageNode.storagePath).toBe('images/photo.webp')
      expect(imageNode.imageId).toBe('img-1')
    }
  })

  it('can mock music picker selection and assert card payload', () => {
    const editor = buildHeadlessArticleEditor()
    const mockMusic = {
      id: 'music-1',
      playerId: 'netease-456',
    } as AdminMusicDto

    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append(
          $createMusicCardNode({
            playerId: mockMusic.playerId,
            auto: false,
            center: true,
          }),
        )
      },
      { discrete: true },
    )

    const document = editorStateToDocument(editor.getEditorState())
    const musicNode = document.root.children[0]
    expect(musicNode?.type).toBe('music-card')
    if (musicNode?.type === 'music-card') {
      expect(musicNode.playerId).toBe('netease-456')
      expect(musicNode.auto).toBe(false)
      expect(musicNode.center).toBe(true)
    }
  })
})
