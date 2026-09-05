import { renderHook } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, $isElementNode, createEditor, TextNode } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/utils/composer-context'
import { updateEditor } from '#/utils/test-editor'
import { useInklingTextEntity } from '@/hooks/useInklingTextEntity'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

class MentionNode extends TextNode {
  static getType() {
    return 'mention'
  }

  static clone(node: TextNode) {
    return new MentionNode(node.getTextContent())
  }
}

function $createMentionNode(text: string) {
  return new MentionNode(text)
}

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [MentionNode],
    onError: () => {},
  })
}

describe('useInklingTextEntity', () => {
  it('creates an entity node when text matches', async () => {
    const editor = createTestEditor()
    mockComposerContext(editor)

    const getMatch = (text: string) => {
      const match = /^@\w+/.exec(text)
      return match ? { start: 0, end: match[0].length } : null
    }

    renderHook(() => useInklingTextEntity(getMatch, MentionNode, (node) => $createMentionNode(node.getTextContent())))

    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('@alice'))
      root.append(paragraph)
    })

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      const child = $isElementNode(paragraph) ? paragraph.getFirstChild() : null
      expect(child).toBeInstanceOf(MentionNode)
      expect(child?.getTextContent()).toBe('@alice')
    })
  })

  it('does not replace text when there is no match', async () => {
    const editor = createTestEditor()
    mockComposerContext(editor)

    const getMatch = (text: string) => {
      const match = /^@\w+/.exec(text)
      return match ? { start: 0, end: match[0].length } : null
    }

    renderHook(() => useInklingTextEntity(getMatch, MentionNode, (node) => $createMentionNode(node.getTextContent())))

    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('hello world'))
      root.append(paragraph)
    })

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      const child = $isElementNode(paragraph) ? paragraph.getFirstChild() : null
      expect(child).toBeInstanceOf(TextNode)
      expect(child).not.toBeInstanceOf(MentionNode)
      expect(child?.getTextContent()).toBe('hello world')
    })
  })

  it('reverts an entity node when it no longer matches', async () => {
    const editor = createTestEditor()
    mockComposerContext(editor)

    const getMatch = (text: string) => {
      const match = /^@\w+/.exec(text)
      return match ? { start: 0, end: match[0].length } : null
    }

    renderHook(() => useInklingTextEntity(getMatch, MentionNode, (node) => $createMentionNode(node.getTextContent())))

    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createMentionNode('hello'))
      root.append(paragraph)
    })

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      const child = $isElementNode(paragraph) ? paragraph.getFirstChild() : null
      expect(child).toBeInstanceOf(TextNode)
      expect(child).not.toBeInstanceOf(MentionNode)
      expect(child?.getTextContent()).toBe('hello')
    })
  })

  it('uses the default TextNode when nodeType is not provided', async () => {
    const editor = createTestEditor()
    mockComposerContext(editor)

    const getMatch = (text: string) => {
      const match = /^@\w+/.exec(text)
      return match ? { start: 0, end: match[0].length } : null
    }

    renderHook(() => useInklingTextEntity(getMatch, MentionNode, (node) => $createMentionNode(node.getTextContent())))

    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('@bob'))
      root.append(paragraph)
    })

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      const child = $isElementNode(paragraph) ? paragraph.getFirstChild() : null
      expect(child).toBeInstanceOf(MentionNode)
    })
  })
})
