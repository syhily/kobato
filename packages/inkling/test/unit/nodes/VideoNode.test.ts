import { createHeadlessEditor } from '@lexical/headless'
import { type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { attachCaptionEditorWithText } from '#/utils/caption-editor'
import { getCardMenu } from '#/utils/card-menu'
import { updateEditor } from '#/utils/test-editor'
import { getCardDragIcon } from '@/nodes/cards/card-menus'
import { VideoNode, $createVideoNode, $isVideoNode, INSERT_VIDEO_COMMAND } from '@/nodes/VideoNode'

const editorNodes = [VideoNode]

describe('VideoNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isVideoNode', async () => {
    await updateEditor(editor, () => {
      const node = $createVideoNode({})
      expect($isVideoNode(node)).toBe(true)
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('video')?.[0]?.label).toBe('Video')
    expect(getCardMenu('video')?.[0]?.insertCommand).toBe(INSERT_VIDEO_COMMAND)
  })

  it('resolves the video drag icon from the card menu', () => {
    expect(typeof getCardDragIcon('video')).toBe('function')
  })

  it('sets __triggerFileDialog when no src is provided', async () => {
    await updateEditor(editor, () => {
      const node = $createVideoNode({ triggerFileDialog: true })
      expect(node.__triggerFileDialog).toBe(true)
    })
  })

  it('getDataset includes caption editor state', async () => {
    await updateEditor(editor, () => {
      const node = $createVideoNode({ caption: 'A caption' })
      const dataset = node.getDataset()

      expect(dataset.caption).toBe('A caption')
      expect(dataset.captionEditor).toBeDefined()
      expect(dataset.captionEditorInitialState).toBeDefined()
    })
  })

  it('exports caption as html when a caption editor exists', async () => {
    await updateEditor(editor, () => {
      const node = $createVideoNode({})
      attachCaptionEditorWithText(node)

      const json = node.exportJSON()
      if (!('caption' in json)) {
        throw new Error('Expected serialized video to include caption')
      }
      expect(json.caption).toContain('Hello caption')
    })
  })
})
