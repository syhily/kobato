import { loadPasteDialect } from '@kobato/inkling-internal/markdown/lazy-paste-dialect'
import { $isCodeBlockNode, CodeBlockNode } from '@kobato/inkling-internal/nodes/CodeBlockNode'
import { registerCardDecorateAdapter } from '@kobato/inkling-internal/nodes/decorate-card'
import { $isHorizontalRuleNode, HorizontalRuleNode } from '@kobato/inkling-internal/nodes/HorizontalRuleNode'
import { PASTE_MARKDOWN_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/clipboard-protocol'
import { MarkdownPastePlugin } from '@kobato/inkling-internal/plugins/MarkdownPastePlugin'
import { LexicalComposerContext, createLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isHeadingNode, HeadingNode, registerRichText } from '@lexical/rich-text'
import { act, renderHook } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  createEditor,
} from 'lexical'
import React, { useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

registerCardDecorateAdapter()

class MockDataTransfer {
  private readonly data = new Map<string, string>()

  setData(format: string, value: string) {
    this.data.set(format, value)
  }

  getData(format: string) {
    return this.data.get(format) ?? ''
  }
}

const originalDataTransfer = globalThis.DataTransfer

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [HeadingNode, CodeBlockNode, HorizontalRuleNode],
    onError: () => {},
    theme: {},
  })
}

type TestEditor = ReturnType<typeof createTestEditor>

function TestWrapper({ children, editor }: { children: React.ReactNode; editor: TestEditor }) {
  const contextValue = useMemo<React.ContextType<typeof LexicalComposerContext>>(
    () => [editor, createLexicalComposerContext(null, {})],
    [editor],
  )
  return <LexicalComposerContext.Provider value={contextValue}>{children}</LexicalComposerContext.Provider>
}

async function pasteMarkdown(editor: TestEditor, text: string, allowBr: boolean) {
  await act(async () => {
    editor.dispatchCommand(PASTE_MARKDOWN_COMMAND, { text, allowBr })
  })
}

describe('MarkdownPastePlugin', () => {
  let editor: TestEditor

  beforeEach(async () => {
    globalThis.DataTransfer = MockDataTransfer as unknown as typeof DataTransfer

    await loadPasteDialect()

    editor = createTestEditor()

    const rootElement = document.createElement('div')
    rootElement.setAttribute('contenteditable', 'true')
    document.body.appendChild(rootElement)
    editor.setRootElement(rootElement)

    await act(async () => {
      editor.update(() => {
        const paragraph = $createParagraphNode()
        const text = $createTextNode('')
        paragraph.append(text)
        $getRoot().append(paragraph)
        text.select()
      })
    })

    await act(async () => {
      renderHook(() => MarkdownPastePlugin(), {
        wrapper: ({ children }) => <TestWrapper editor={editor}>{children}</TestWrapper>,
      })
    })

    registerRichText(editor)
  })

  afterEach(() => {
    globalThis.DataTransfer = originalDataTransfer
    document.body.innerHTML = ''
  })

  it('converts pasted markdown into rich text (# Title becomes a heading)', async () => {
    await pasteMarkdown(editor, '# Title', false)

    editor.getEditorState().read(() => {
      const heading = $getRoot().getFirstChild()
      expect($isHeadingNode(heading)).toBe(true)
      expect(heading?.getTextContent()).toBe('Title')
    })
  })

  it('inserts raw text without markdown conversion while shift is held', async () => {
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }))
    })

    await pasteMarkdown(editor, '# Title', false)

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      expect($isParagraphNode(paragraph)).toBe(true)
      expect(paragraph?.getTextContent()).toBe('# Title')
    })

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', shiftKey: false }))
    })
  })

  it('strips <br> tags from converted markdown when allowBr is false', async () => {
    await pasteMarkdown(editor, 'a  \nb', false)

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      expect($isParagraphNode(paragraph)).toBe(true)
      expect($isParagraphNode(paragraph) && paragraph.getChildren().some((node) => $isLineBreakNode(node))).toBe(false)
    })
  })

  it('keeps <br> line breaks when allowBr is true', async () => {
    await pasteMarkdown(editor, 'a  \nb', true)

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      expect($isParagraphNode(paragraph)).toBe(true)
      expect($isParagraphNode(paragraph) && paragraph.getChildren().some((node) => $isLineBreakNode(node))).toBe(true)
    })
  })

  describe('paste dialect coverage', () => {
    it('turns a pasted inkling:* card fence into a code block card, not the named card', async () => {
      const json = '{"url":"https://example.com","title":"Example"}'
      await pasteMarkdown(editor, '```inkling:bookmark\n' + json + '\n```', false)

      editor.getEditorState().read(() => {
        const children = $getRoot().getChildren()
        expect(children).toHaveLength(1)

        const node = children[0]
        expect($isCodeBlockNode(node)).toBe(true)
        if ($isCodeBlockNode(node)) {
          expect(node.language).toBe('inkling:bookmark')
          expect(node.code).toBe(json + '\n')
        }
      })
    })

    it('converts ==marked== into highlight-formatted text', async () => {
      await pasteMarkdown(editor, '==marked==', false)

      editor.getEditorState().read(() => {
        const paragraph = $getRoot().getFirstChild()
        expect($isParagraphNode(paragraph)).toBe(true)

        const text = $isParagraphNode(paragraph) ? paragraph.getFirstChild() : null
        expect($isTextNode(text)).toBe(true)
        if ($isTextNode(text)) {
          expect(text.getTextContent()).toBe('marked')
          expect(text.hasFormat('highlight')).toBe(true)
        }
      })
    })

    it('converts ~sub~ and ^sup^ into subscript- and superscript-formatted text', async () => {
      await pasteMarkdown(editor, '~sub~ and ^sup^', false)

      editor.getEditorState().read(() => {
        const paragraph = $getRoot().getFirstChild()
        expect($isParagraphNode(paragraph)).toBe(true)
        if (!$isParagraphNode(paragraph)) {
          return
        }

        const [sub, between, sup] = paragraph.getChildren()
        expect($isTextNode(sub) && sub.hasFormat('subscript')).toBe(true)
        expect($isTextNode(between) && between.getTextContent()).toBe(' and ')
        expect($isTextNode(sup) && sup.hasFormat('superscript')).toBe(true)
      })
    })

    it('flattens a footnote into a superscript ref plus plain body text, links stripped', async () => {
      await pasteMarkdown(editor, 'Here is a note.[^1]\n\n[^1]: The footnote text.', false)

      editor.getEditorState().read(() => {
        const children = $getRoot().getChildren()
        expect(children).toHaveLength(3)

        const lead = children[0]
        expect($isParagraphNode(lead)).toBe(true)
        if ($isParagraphNode(lead)) {
          const [plain, ref] = lead.getChildren()
          expect($isTextNode(plain) && plain.getTextContent()).toBe('Here is a note.')
          expect($isTextNode(ref) && ref.getTextContent()).toBe('[1]')
          expect($isTextNode(ref) && ref.hasFormat('superscript')).toBe(true)
        }

        expect($isHorizontalRuleNode(children[1])).toBe(true)

        const body = children[2]
        expect($isParagraphNode(body)).toBe(true)
        if ($isParagraphNode(body)) {
          expect(body.getTextContent()).toBe('The footnote text. ↩︎')
          const bodyText = body.getFirstChild()
          expect($isTextNode(bodyText) && bodyText.getFormat()).toBe(0)
        }
      })
    })
  })
})
