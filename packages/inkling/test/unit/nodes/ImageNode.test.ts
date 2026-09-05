import { createHeadlessEditor } from '@lexical/headless'
import { type EditorConfig, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { attachCaptionEditorWithText } from '#/utils/caption-editor'
import { getCardMenu } from '#/utils/card-menu'
import { updateEditor } from '#/utils/test-editor'
import { getCardDragIcon } from '@/nodes/cards/card-menus'
import { ImageNode, $createImageNode, $isImageNode, INSERT_IMAGE_COMMAND } from '@/nodes/ImageNode'

const editorNodes = [ImageNode]
const imageEditorConfig: EditorConfig = {
  namespace: 'test',
  theme: {},
}

describe('ImageNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isImageNode', async () => {
    await updateEditor(editor, () => {
      const imageNode = $createImageNode({ src: '/image.png' })
      expect($isImageNode(imageNode)).toBe(true)
    })
  })

  it('exposes triggerFileDialog setter', async () => {
    await updateEditor(editor, () => {
      const imageNode = $createImageNode({ src: '/image.png' })
      expect(imageNode.__triggerFileDialog).toBe(false)

      imageNode.triggerFileDialog = true
      expect(imageNode.__triggerFileDialog).toBe(true)
    })
  })

  it('includes transient properties in getDataset', async () => {
    await updateEditor(editor, () => {
      const imageNode = $createImageNode({ src: '/image.png', previewSrc: 'blob://preview' })
      imageNode.triggerFileDialog = true

      const dataset = imageNode.getDataset()
      expect(dataset.__previewSrc).toBe('blob://preview')
      expect(dataset.__triggerFileDialog).toBe(true)
      expect(dataset.src).toBe('/image.png')
    })
  })

  it('guards against a missing editor when exporting caption JSON', async () => {
    await updateEditor(editor, () => {
      const imageNode = $createImageNode({ src: '/image.png', caption: 'A caption' })
      const json = imageNode.exportJSON()
      if (!('caption' in json)) {
        throw new Error('Expected serialized image to include caption')
      }
      expect(json.caption).toBe('A caption')
    })
  })

  it('exports caption as HTML when a caption editor exists', async () => {
    await updateEditor(editor, () => {
      const imageNode = $createImageNode({ src: '/image.png' })
      attachCaptionEditorWithText(imageNode)

      const json = imageNode.exportJSON()
      if (!('caption' in json)) {
        throw new Error('Expected serialized image to include caption')
      }
      expect(json.caption).toContain('Hello caption')
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('image')?.[0]?.label).toBe('Image')
    expect(getCardMenu('image')?.[0]?.insertCommand).toBe(INSERT_IMAGE_COMMAND)
  })

  it('resolves the drag icon from the first cardMenu entry (Image, not GIF)', () => {
    expect(getCardDragIcon('image')).toBe(getCardMenu('image')?.[0]?.Icon)
    expect(typeof getCardDragIcon('image')).toBe('function')
  })

  it('creates a div DOM element', async () => {
    await updateEditor(editor, () => {
      const imageNode = $createImageNode({ src: '/image.png' })
      const element = imageNode.createDOM(imageEditorConfig, editor)
      expect(element.tagName).toBe('DIV')
    })
  })

  it('supports reading and writing previewSrc', async () => {
    await updateEditor(editor, () => {
      const imageNode = $createImageNode({ src: '/image.png' })
      imageNode.previewSrc = 'blob://preview'
      expect(imageNode.previewSrc).toBe('blob://preview')
    })
  })
})
