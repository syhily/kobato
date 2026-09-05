import { $generateNodesFromSerializedNodes, $insertGeneratedNodes } from '@lexical/clipboard'
import { $getSelection, type LexicalEditor, type SerializedLexicalNode } from 'lexical'

import { $isInklingCard } from '@/nodes/base'
import { $ensureParagraphAfterCard } from '@/utils/$ensureParagraphAfterCard'

import { INSERT_CARD_COMMAND } from './commands'

// Snippet insertion — the headless module behind InklingSnippetPlugin. A
// snippet is a host-managed fragment of serialized editor state (the
// `{ name, value }` menu insertParams built by `@/nodes/cards/card-menu-build`);
// inserting one parses the value, regenerates the nodes, and splices them at
// the selection. Two special cases live here: a single-card snippet goes
// through the card insert path (`INSERT_CARD_COMMAND`) so the card lands like
// any other card insert, and a snippet whose last node is a card gets a
// trailing paragraph so the caret has somewhere to go after it. The plugin
// keeps only the command registration.

/** The snippet insert payload — the `{ name, value }` pair the snippet menu
 * entry dispatches through the type-erased menu insert path
 * (`@/nodes/cards/card-menu-build`). */
export interface SnippetDataset {
  name: string
  value: string
}

// Command payloads cross an untyped runtime boundary (menu dispatch, external
// consumers), so narrow before parsing the snippet value.
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

// A serialized node minimally needs a string `type` for
// $generateNodesFromSerializedNodes to resolve its registered class — a
// shallower entry would throw inside the editor update.
function isSerializedNodeShape(node: unknown): node is SerializedLexicalNode {
  return typeof node === 'object' && node !== null && 'type' in node && typeof node.type === 'string'
}

// The snippet value is host-supplied data, so a malformed one no-ops silently
// instead of throwing inside the editor update.
function parseSnippetNodes(value: string): SerializedLexicalNode[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (_e) {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { nodes?: unknown }).nodes)) {
    return null
  }
  const nodes: unknown[] = (parsed as { nodes: unknown[] }).nodes
  if (!nodes.every(isSerializedNodeShape)) {
    return null
  }
  return nodes
}

/**
 * Inserts the snippet `dataset` at the current selection. A $-function: it
 * must run inside editor.update()/editor.read() — the INSERT_SNIPPET_COMMAND
 * handler already runs in the dispatch update, and headless callers wrap the
 * call themselves. Returns false — and leaves the editor untouched — when the
 * payload is not a snippet dataset, the value does not parse to a serialized
 * node list, node generation fails (e.g. an unregistered `type`), or there is
 * no selection to insert at.
 */
export function $insertSnippet(editor: LexicalEditor, dataset: unknown): boolean {
  if (!isSnippetDataset(dataset)) {
    return false
  }
  const serializedNodes = parseSnippetNodes(dataset.value)
  if (!serializedNodes) {
    return false
  }
  // an entry with a string type can still fail generation — an unregistered
  // type warns in dev and then throws on the missing registeredNode. The
  // same host-data contract applies: no-op instead of throwing in the update.
  let nodes: ReturnType<typeof $generateNodesFromSerializedNodes>
  try {
    nodes = $generateNodesFromSerializedNodes(serializedNodes)
  } catch (_e) {
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
