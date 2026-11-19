import { $isInklingCard } from '@kobato/inkling-internal/nodes/base'
import { INSERT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { $ensureParagraphAfterCard } from '@kobato/inkling-internal/utils/$ensureParagraphAfterCard'
import { $generateNodesFromSerializedNodes, $insertGeneratedNodes } from '@lexical/clipboard'
import { $getSelection, type LexicalEditor, type SerializedLexicalNode } from 'lexical'

export interface SnippetDataset {
  name: string
  value: string
}

export function isSnippetDataset(dataset: unknown): dataset is SnippetDataset {
  return (
    typeof dataset === 'object' &&
    dataset !== null &&
    'name' in dataset &&
    typeof dataset.name === 'string' &&
    'value' in dataset &&
    typeof dataset.value === 'string'
  )
}

function isSerializedNodeShape(node: unknown): node is SerializedLexicalNode {
  return typeof node === 'object' && node !== null && 'type' in node && typeof node.type === 'string'
}

function parseSnippetNodes(value: string): SerializedLexicalNode[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || !('nodes' in parsed) || !Array.isArray(parsed.nodes)) {
    return null
  }
  const nodes: unknown[] = parsed.nodes
  if (!nodes.every(isSerializedNodeShape)) {
    return null
  }
  return nodes
}

export function $insertSnippet(editor: LexicalEditor, dataset: unknown): boolean {
  if (!isSnippetDataset(dataset)) {
    return false
  }
  const serializedNodes = parseSnippetNodes(dataset.value)
  if (!serializedNodes) {
    return false
  }
  let nodes: ReturnType<typeof $generateNodesFromSerializedNodes>
  try {
    nodes = $generateNodesFromSerializedNodes(serializedNodes)
  } catch {
    return false
  }
  const firstNode = nodes.length === 1 ? nodes[0] : null
  const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null

  if (firstNode && $isInklingCard(firstNode)) {
    editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode: firstNode })

    return true
  }

  const selection = $getSelection()
  if (!selection) {
    return false
  }
  $insertGeneratedNodes(editor, nodes, selection)

  if (lastNode && $isInklingCard(lastNode)) {
    $ensureParagraphAfterCard(lastNode)
  }
  return true
}
