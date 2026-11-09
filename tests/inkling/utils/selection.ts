import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setSelection,
  createEditor,
  type LexicalEditor,
  type LexicalNodeConfig,
} from 'lexical'

import { updateEditor } from '#/inkling/utils/test-editor'

// Selection-editor harness shared by the word-count and keyboard specs: one
// rooted/rootless editor factory, the content/seed write, and the range
// writes the tests repeat. Specialized editor construction (rich-text
// registration, parent links, card nodes) stays local to each spec — this
// module owns only the operations that were duplicated verbatim.

const SELECTION_EDITOR_ROOT_ATTRIBUTE = 'data-test-selection-editor'

export interface SelectionEditorOptions {
  nodes?: LexicalNodeConfig[]
  parentEditor?: LexicalEditor
  /** Attach a DOM root (default true). Rootless editors drive focus through the FOCUS/BLUR ledger. */
  root?: boolean
}

export function createSelectionEditor({
  nodes,
  parentEditor,
  root = true,
}: SelectionEditorOptions = {}): LexicalEditor {
  const editor = createEditor({
    namespace: 'test',
    nodes,
    parentEditor,
    onError: () => {},
  })

  if (root) {
    const rootElement = document.createElement('div')
    rootElement.setAttribute('contenteditable', 'true')
    rootElement.setAttribute(SELECTION_EDITOR_ROOT_ATTRIBUTE, '')
    document.body.appendChild(rootElement)
    editor.setRootElement(rootElement)
  }

  editor.update(
    () => {
      const rootNode = $getRoot()
      rootNode.clear()
      rootNode.append($createParagraphNode())
    },
    { discrete: true },
  )

  return editor
}

/** Remove every rooted editor this harness attached; call from a suite's afterEach. */
export function cleanupSelectionEditors() {
  for (const rootElement of document.querySelectorAll(`[${SELECTION_EDITOR_ROOT_ATTRIBUTE}]`)) {
    rootElement.remove()
  }
}

export async function seedSelectionEditor(editor: LexicalEditor, paragraphs: string[]) {
  await updateEditor(
    editor,
    () => {
      const root = $getRoot()
      root.clear()
      for (const text of paragraphs) {
        root.append($createParagraphNode().append($createTextNode(text)))
      }
    },
    { discrete: true },
  )
}

export function firstTextKey(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const paragraph = $getRoot().getFirstChild()
    if (!$isElementNode(paragraph)) {
      throw new Error('Expected a paragraph')
    }
    const text = paragraph.getFirstChild()
    if (!$isTextNode(text)) {
      throw new Error('Expected a text node')
    }
    return text.getKey()
  })
}

export async function selectText(
  editor: LexicalEditor,
  textNodeKey: string,
  anchorOffset: number,
  focusOffset: number,
) {
  await updateEditor(
    editor,
    () => {
      const text = $getNodeByKey(textNodeKey)
      if (!$isTextNode(text)) {
        throw new Error('Expected a text node')
      }
      text.select(anchorOffset, focusOffset)
    },
    { discrete: true },
  )
}

/** Select a range in the first text node of the document. */
export async function selectFirstText(editor: LexicalEditor, anchorOffset: number, focusOffset: number) {
  await selectText(editor, firstTextKey(editor), anchorOffset, focusOffset)
}

/** Select from the first paragraph's anchor offset to the last paragraph's focus offset. */
export async function selectAcrossParagraphs(editor: LexicalEditor, anchorOffset: number, focusOffset: number) {
  await updateEditor(
    editor,
    () => {
      const firstParagraph = $getRoot().getFirstChild()
      const lastParagraph = $getRoot().getLastChild()
      if (!$isElementNode(firstParagraph) || !$isElementNode(lastParagraph)) {
        throw new Error('Expected two paragraphs')
      }
      const first = firstParagraph.getFirstChild()
      const last = lastParagraph.getFirstChild()
      if (!$isTextNode(first) || !$isTextNode(last)) {
        throw new Error('Expected two paragraphs with text')
      }
      const selection = $createRangeSelection()
      selection.anchor.set(first.getKey(), anchorOffset, 'text')
      selection.focus.set(last.getKey(), focusOffset, 'text')
      $setSelection(selection)
    },
    { discrete: true },
  )
}
