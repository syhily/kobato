import { createHeadlessEditor } from '@lexical/headless'
import { type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import type { GalleryImage } from '@/types/gallery'

import { attachCaptionEditorWithText } from '#/utils/caption-editor'
import { getCardMenu } from '#/utils/card-menu'
import { updateEditor } from '#/utils/test-editor'
import { getCardDragIcon } from '@/nodes/cards/card-menus'
import {
  GalleryNode,
  $createGalleryNode,
  $isGalleryNode,
  INSERT_GALLERY_COMMAND,
  MAX_IMAGES,
  recalculateImageRows,
} from '@/nodes/GalleryNode'

const editorNodes = [GalleryNode]

describe('GalleryNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isGalleryNode', async () => {
    await updateEditor(editor, () => {
      const node = $createGalleryNode({})
      expect($isGalleryNode(node)).toBe(true)
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('gallery')?.[0]?.label).toBe('Gallery')
    expect(getCardMenu('gallery')?.[0]?.insertCommand).toBe(INSERT_GALLERY_COMMAND)
  })

  it('resolves the gallery drag icon from the card menu', () => {
    expect(typeof getCardDragIcon('gallery')).toBe('function')
  })

  it('getDataset includes caption editor state', async () => {
    await updateEditor(editor, () => {
      const node = $createGalleryNode({ caption: 'A caption' })
      const dataset = node.getDataset()

      expect(dataset.caption).toBe('A caption')
      expect(dataset.captionEditor).toBeDefined()
      expect(dataset.captionEditorInitialState).toBeDefined()
    })
  })

  it('exports caption as html when a caption editor exists', async () => {
    await updateEditor(editor, () => {
      const node = $createGalleryNode({})
      attachCaptionEditorWithText(node)

      const json = node.exportJSON()
      if (!('caption' in json)) {
        throw new Error('Expected serialized gallery to include caption')
      }
      expect(json.caption).toContain('Hello caption')
    })
  })

  it('recalculates image rows', () => {
    const images: GalleryImage[] = [{ src: '1' }, { src: '2' }, { src: '3' }, { src: '4' }]
    recalculateImageRows(images)

    expect(images[0].row).toBe(0)
    expect(images[1].row).toBe(0)
    expect(images[2].row).toBe(0)
    expect(images[3].row).toBe(1)
  })

  it('limits images when setting', async () => {
    await updateEditor(editor, () => {
      const node = $createGalleryNode({})
      const images = Array.from({ length: MAX_IMAGES + 2 }, (_, i) => ({ src: String(i) }))
      node.setImages(images as import('@/types/gallery').GalleryImage[])

      expect(node.images).toHaveLength(MAX_IMAGES)
    })
  })

  it('adds images up to the maximum', async () => {
    await updateEditor(editor, () => {
      const node = $createGalleryNode({})
      node.setImages([{ src: '0' }, { src: '1' }] as import('@/types/gallery').GalleryImage[])
      node.addImages(
        Array.from({ length: MAX_IMAGES }, (_, i) => ({
          src: String(i + 2),
        })) as import('@/types/gallery').GalleryImage[],
      )

      expect(node.images).toHaveLength(MAX_IMAGES)
    })
  })
})
