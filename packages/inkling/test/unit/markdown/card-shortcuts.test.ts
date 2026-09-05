import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isParagraphNode,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { describe, expect, it } from 'vitest'

import { createTestEditor, updateEditor } from '#/utils/test-editor'
import { $fireFenceKeyboardShortcut, $insertCodeBlockForShortcut } from '@/markdown/card-shortcuts'
import { $isCodeBlockNode, CodeBlockNode } from '@/nodes/CodeBlockNode'

// Direct pins for the enter/tab fence trigger body (the card-shortcut seam).
// The full keyboard dispatch paths — enter, tab, and the isNested guard — are
// pinned in test/unit/plugins/behaviour/registerKeyboardNavigation.test.ts.

async function setupParagraph(editor: LexicalEditor, text: string) {
  await updateEditor(editor, () => {
    const paragraph = $createParagraphNode()
    const textNode = $createTextNode(text)
    paragraph.append(textNode)
    $getRoot().append(paragraph)
    textNode.select(text.length, text.length)
  })
}

function fireShortcut(editor: LexicalEditor, event: KeyboardEvent): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false
    editor.update(
      () => {
        result = $fireFenceKeyboardShortcut(event)
      },
      { onUpdate: () => resolve(result) },
    )
  })
}

describe('$fireFenceKeyboardShortcut', () => {
  it('replaces a fence paragraph with a selected code block in edit mode', async () => {
    const editor = createTestEditor({ nodes: [CodeBlockNode], headless: false })
    await setupParagraph(editor, '```js')
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })

    const result = await fireShortcut(editor, event)

    expect(result).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    editor.getEditorState().read(() => {
      const root = $getRoot()
      expect(root.getChildrenSize()).toBe(1)
      const codeBlock = root.getFirstChild()
      expect($isCodeBlockNode(codeBlock)).toBe(true)
      expect(codeBlock).toMatchObject({ __openInEditMode: true, language: 'js' })
      const selection = $getSelection()
      expect($isNodeSelection(selection)).toBe(true)
      expect(selection?.getNodes()[0]?.getKey()).toBe(codeBlock?.getKey())
    })
  })

  it('takes the full rest of the line as the language', async () => {
    const editor = createTestEditor({ nodes: [CodeBlockNode], headless: false })
    await setupParagraph(editor, '```js extra')

    const result = await fireShortcut(editor, new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }))

    expect(result).toBe(true)
    editor.getEditorState().read(() => {
      const codeBlock = $getRoot().getFirstChild()
      expect($isCodeBlockNode(codeBlock)).toBe(true)
      expect(codeBlock).toMatchObject({ language: 'js extra' })
    })
  })

  it('fires on a bare fence with an empty language', async () => {
    const editor = createTestEditor({ nodes: [CodeBlockNode], headless: false })
    await setupParagraph(editor, '```')

    const result = await fireShortcut(editor, new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))

    expect(result).toBe(true)
    editor.getEditorState().read(() => {
      const codeBlock = $getRoot().getFirstChild()
      expect($isCodeBlockNode(codeBlock)).toBe(true)
      expect(codeBlock).toMatchObject({ language: '' })
    })
  })

  it('does not fire on a non-fence line', async () => {
    const editor = createTestEditor({ nodes: [CodeBlockNode], headless: false })
    await setupParagraph(editor, 'hello')
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })

    const result = await fireShortcut(editor, event)

    expect(result).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      expect($isParagraphNode(paragraph)).toBe(true)
      expect(paragraph?.getTextContent()).toBe('hello')
    })
  })

  it('does not fire without a text-node selection', async () => {
    const editor = createTestEditor({ nodes: [CodeBlockNode], headless: false })
    await updateEditor(editor, () => {
      $getRoot().append($createParagraphNode())
    })
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })

    const result = await fireShortcut(editor, event)

    expect(result).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('$fireFenceKeyboardShortcut without the code card registered', () => {
  // plan C5: the class comes from the editor's registered-node map, so a
  // card-free composition (the ./core entry) gets no fence shortcut — the
  // paragraph stays untouched and the event is NOT consumed, letting the
  // caller fall through to its other key handling.
  function createCardlessEditor(): LexicalEditor {
    return createEditor({
      namespace: 'test',
      nodes: [],
      onError: () => {},
    })
  }

  it('returns false and leaves the fence paragraph in place', async () => {
    const editor = createCardlessEditor()
    await setupParagraph(editor, '```js')
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })

    const result = await fireShortcut(editor, event)

    expect(result).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      expect($isParagraphNode(paragraph)).toBe(true)
      expect(paragraph?.getTextContent()).toBe('```js')
    })
  })

  it('$insertCodeBlockForShortcut returns false and leaves the tree untouched', async () => {
    const editor = createCardlessEditor()
    await setupParagraph(editor, '```js')

    let inserted: boolean | undefined
    await updateEditor(editor, () => {
      const paragraph = $getRoot().getFirstChild()
      if ($isParagraphNode(paragraph)) {
        inserted = $insertCodeBlockForShortcut(paragraph, 'js')
      }
    })

    expect(inserted).toBe(false)
    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1)
      expect($isParagraphNode($getRoot().getFirstChild())).toBe(true)
    })
  })
})
