import type { SerializedEditorState } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListNode, ListItemNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableNode, TableCellNode, TableRowNode } from '@lexical/table'
import { $getRoot, ParagraphNode } from 'lexical'

import { PocCardNode } from '@/ui/inkling/poc/PocCardNode'

export interface HeadlessRuntimeProbeResult {
  textContent: string
  nodeCount: number
}

export function createHeadlessRuntimeProbe() {
  return createHeadlessEditor({
    namespace: 'inkling-headless-runtime-probe',
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Headless runtime probe error:', error)
    },
    nodes: [
      ParagraphNode,
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      PocCardNode,
    ],
  })
}

export function probeHeadlessEditorState(editorState: SerializedEditorState): HeadlessRuntimeProbeResult {
  const editor = createHeadlessRuntimeProbe()

  editor.setEditorState(editor.parseEditorState(editorState))

  let textContent = ''
  let nodeCount = 0

  editor.read(() => {
    const root = $getRoot()
    textContent = root.getTextContent()
    nodeCount = root.getChildrenSize()
  })

  return { textContent, nodeCount }
}
