import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import type { LexicalEditor, LexicalNode, SerializedEditorState } from 'lexical'

import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
// HorizontalRuleNode from @lexical/react re-exports the @lexical/extension node
// and carries a deprecation notice; the extension package is not hoisted here.
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'
import { HeadingNode, QuoteNode, registerRichText } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import {
  $createLineBreakNode,
  $createParagraphNode,
  $getRoot,
  $isLineBreakNode,
  $isParagraphNode,
  createEditor,
  ParagraphNode,
  PASTE_COMMAND,
} from 'lexical'

import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'
import { PocCodeBlockNode } from '@/ui/inkling/poc/PocCodeBlockNode'
import { PocImageCardNode } from '@/ui/inkling/poc/PocImageCardNode'

export const PASTE_PROBE_NODES: InitialConfigType['nodes'] = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  // oxlint-disable-next-line typescript/no-deprecated -- @lexical/extension is not installed; probe only
  HorizontalRuleNode,
  PocCodeBlockNode,
  PocImageCardNode,
  FootnoteRefNode,
]

function setInitialSelection(editor: LexicalEditor): void {
  editor.update(
    () => {
      const root = $getRoot()
      if (root.getChildrenSize() === 0) {
        root.append($createParagraphNode())
      }
      const first = root.getFirstChild()
      if ($isParagraphNode(first)) {
        first.select(0, 0)
      }
    },
    { discrete: true },
  )
}

export function createPasteProbeEditor(): LexicalEditor {
  const editor = createEditor({
    namespace: 'inkling-paste-probe',
    nodes: PASTE_PROBE_NODES,
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Paste probe editor error:', error)
    },
    theme: {
      paragraph: 'inkling-paragraph',
      heading: { h1: 'inkling-h1', h2: 'inkling-h2', h3: 'inkling-h3', h4: 'inkling-h4' },
      list: { ul: 'inkling-ul', ol: 'inkling-ol' },
      link: 'inkling-link',
    },
  })

  registerRichText(editor)
  registerPasteProbeTransforms(editor)
  setInitialSelection(editor)
  return editor
}

/**
 * Lexical wraps content inside block containers (table cells, blockquotes) in
 * paragraphs. Inkling's schema keeps those children inline-only, so flatten
 * the wrapper paragraphs after any update, inserting line breaks between
 * original paragraphs to preserve boundaries.
 */
export function registerPasteProbeTransforms(editor: LexicalEditor): void {
  registerBlockContainerFlattenTransform(editor)
  registerQuoteFlattenTransform(editor)
}

export function normalizeSerializedTableShape(state: SerializedEditorState): SerializedEditorState {
  function visit(node: unknown): unknown {
    if (!node || typeof node !== 'object') {
      return node
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- visit receives arbitrary JSON nodes
    const n = node as Record<string, unknown>

    if (n.type === 'table' && Array.isArray(n.children)) {
      return { ...n, rows: n.children.map(visit), children: undefined }
    }

    if (n.type === 'tablerow' && Array.isArray(n.children)) {
      return { ...n, cells: n.children.map(visit), children: undefined }
    }

    if (Array.isArray(n.children)) {
      return { ...n, children: n.children.map(visit) }
    }

    return n
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- visit recursively rebuilds the root shape
  return { root: visit(state.root) as SerializedEditorState['root'] }
}

type ContainerLike = {
  getChildren(): LexicalNode[]
  append(...nodes: LexicalNode[]): void
}

function flattenContainer(container: ContainerLike): void {
  const children = container.getChildren()
  const hasParagraph = children.some((child) => $isParagraphNode(child))
  if (!hasParagraph) {
    return
  }

  const flattened: LexicalNode[] = []
  for (const child of children) {
    if ($isParagraphNode(child)) {
      for (const inline of child.getChildren()) {
        flattened.push(inline)
      }
      flattened.push($createLineBreakNode())
    } else {
      flattened.push(child)
    }
  }

  if (flattened.length > 0 && $isLineBreakNode(flattened[flattened.length - 1]!)) {
    flattened.pop()
  }

  for (const child of children) {
    child.remove()
  }
  for (const node of flattened) {
    container.append(node)
  }
}

function registerBlockContainerFlattenTransform(editor: LexicalEditor): () => void {
  return editor.registerNodeTransform(TableCellNode, (cell) => {
    flattenContainer(cell)
  })
}

function registerQuoteFlattenTransform(editor: LexicalEditor): () => void {
  return editor.registerNodeTransform(QuoteNode, (quote) => {
    flattenContainer(quote)
  })
}

function buildPasteEvent(html: string): ClipboardEvent {
  const dataTransfer = new DataTransfer()
  dataTransfer.setData('text/html', html)
  return new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
  })
}

/**
 * Paste HTML into a fresh paste-probe editor through Lexical's PASTE_COMMAND,
 * wait for the resulting update, and return the serialized editor state.
 *
 * This exercises the full importDOM + rich-text paste path, including any
 * registered transforms and command listeners.
 */
export function pasteHtmlIntoEditor(html: string): Promise<SerializedEditorState> {
  const editor = createPasteProbeEditor()
  const event = buildPasteEvent(html)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      removeListener()
      reject(new Error('paste probe timed out waiting for editor update'))
    }, 5000)

    const removeListener = editor.registerUpdateListener(({ editorState }) => {
      // Ignore the initial empty state; wait for the paste-driven update.
      const children = editorState.toJSON().root.children
      if (children.length === 0) {
        return
      }
      const first = children[0]
      if (first && 'children' in first && Array.isArray(first.children) && first.children.length === 0) {
        return
      }

      clearTimeout(timeout)
      removeListener()
      resolve(normalizeSerializedTableShape(editorState.toJSON()))
    })

    editor.dispatchCommand(PASTE_COMMAND, event)
  })
}
