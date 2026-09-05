import { createHeadlessEditor } from '@lexical/headless'
import { type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { attachCaptionEditorWithText } from '#/utils/caption-editor'
import { getCardMenu } from '#/utils/card-menu'
import { updateEditor } from '#/utils/test-editor'
import { BookmarkNode, $createBookmarkNode, $isBookmarkNode, INSERT_BOOKMARK_COMMAND } from '@/nodes/BookmarkNode'
import { getCardDragIcon } from '@/nodes/cards/card-menus'

const editorNodes = [BookmarkNode]

describe('BookmarkNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isBookmarkNode', async () => {
    await updateEditor(editor, () => {
      const bookmarkNode = $createBookmarkNode({})
      expect($isBookmarkNode(bookmarkNode)).toBe(true)
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('bookmark')?.[0]?.label).toBe('Bookmark')
    expect(getCardMenu('bookmark')?.[0]?.insertCommand).toBe(INSERT_BOOKMARK_COMMAND)
  })

  it('resolves the bookmark drag icon from the card menu', () => {
    expect(typeof getCardDragIcon('bookmark')).toBe('function')
  })

  it('flags __createdWithUrl when constructed with a url and no metadata', async () => {
    await updateEditor(editor, () => {
      const node = $createBookmarkNode({ url: 'https://example.com' })
      expect(node.__createdWithUrl).toBe(true)
    })
  })

  it('getDataset includes caption editor state', async () => {
    await updateEditor(editor, () => {
      const node = $createBookmarkNode({ caption: 'A caption' })
      const dataset = node.getDataset()

      expect(dataset.caption).toBe('A caption')
      expect(dataset.captionEditor).toBeDefined()
      expect(dataset.captionEditorInitialState).toBeDefined()
    })
  })

  it('exports caption as html when a caption editor exists', async () => {
    await updateEditor(editor, () => {
      const node = $createBookmarkNode({})
      attachCaptionEditorWithText(node)

      const json = node.exportJSON()
      expect(json.caption).toContain('Hello caption')
    })
  })

  it('exports raw caption when no caption editor exists', async () => {
    await updateEditor(editor, () => {
      const node = $createBookmarkNode({ caption: 'Raw caption' })
      const json = node.exportJSON()
      expect(json.caption).toBe('Raw caption')
    })
  })
})
