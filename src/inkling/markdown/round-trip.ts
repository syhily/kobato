import type { Klass, LexicalNode, SerializedEditorState } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  isTableRowDivider,
  type MultilineElementTransformer,
  type Transformer,
} from '@lexical/markdown'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { $createParagraphNode } from 'lexical'

import type { HostCard } from '@/inkling/nodes/cards/host-cards'

import { codeBlockFence, stripFenceLines } from '@/inkling/markdown/card-shortcuts'
import { FENCE_END_REGEXP, FENCE_IMPORT_REGEXP } from '@/inkling/markdown/grammar'
import { DEFAULT_TRANSFORMERS } from '@/inkling/markdown/transformers'
import { MINIMAL_TRANSFORMERS } from '@/inkling/markdown/transformers-core'
import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { $createMarkdownNode, $isMarkdownNode, MarkdownNode } from '@/inkling/nodes/base/nodes/markdown/MarkdownNode'
import { CARD_MARKDOWN_DECLARATIONS, createCardTransformer } from '@/inkling/nodes/cards/card-markdown-transformers'
import { getHostCards } from '@/inkling/nodes/cards/host-card-registry'
import { $createCodeBlockNode, $isCodeBlockNode, CodeBlockNode } from '@/inkling/nodes/CodeBlockNode'
import { resolveGfmPipeTableLines } from '@/inkling/nodes/table/table-facts'
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
  type TableCellHeaderState,
} from '@/inkling/nodes/table/TableNodes'

/**
 * The card-aware round-trip dialect — one of Inkling's two markdown dialects
 * (the paste dialect is `@/inkling/markdown/paste-dialect`) and the public markdown
 * import/export API (`markdownToLexicalState` / `lexicalStateToMarkdown`).
 *
 * It speaks ```inkling:<card>``` fences, standard `![alt](src)` image syntax,
 * and the shared grammar table's inline delimiters
 * (`@/inkling/markdown/grammar`) — but not footnotes. Conversion runs through
 * `@lexical/markdown`'s `$convertFromMarkdownString` /
 * `$convertToMarkdownString` on a temporary headless editor with the
 * constrained node set below.
 */

// The markdown-eligible cards in declaration order — the same order the node
// sets compose (the declaration's `markdown` eligibility spec is the filter).
// Transformer order among cards is unobservable (each card transformer exports
// only its own node type; the import regexes are per-card distinct), pinned by
// tests/inkling/unit/nodes/derived-node-sets.test.ts.
const MARKDOWN_CARDS = CARD_MARKDOWN_DECLARATIONS.filter((card) => 'markdown' in card && card.markdown !== undefined)

// Exported for the node-set diff test, not part of the public `@/inkling/markdown` barrel.
export const MARKDOWN_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  ...MARKDOWN_CARDS.map((card) => card.node),
  MarkdownNode,
]

// MarkdownNode is a base-only node, not a card, so its `inkling:markdown`
// fence transformer stays hand-written here beside the dialect rather than
// in the card transformer table.
const MARKDOWN_CARD_TRANSFORMER: MultilineElementTransformer = {
  dependencies: [MarkdownNode],
  export: (node) => {
    if (!$isMarkdownNode(node)) {
      return null
    }
    return '```inkling:markdown\n' + node.markdown + '\n```'
  },
  regExpEnd: FENCE_END_REGEXP,
  regExpStart: /^```inkling:markdown\s*$/,
  replace: (rootNode, _children, _startMatch, _endMatch, linesInBetween, _isImport) => {
    rootNode.append($createMarkdownNode({ markdown: stripFenceLines(linesInBetween) }))
  },
  type: 'multiline-element',
}

export const CARD_TRANSFORMERS: Transformer[] = [
  ...MARKDOWN_CARDS.flatMap((card) => (card.markdownTransformer ? [card.markdownTransformer] : [])),
  MARKDOWN_CARD_TRANSFORMER,
]

// Fenced code blocks are this dialect's grammar, so the dialect carries its own
// multiline transformer: the shared `CODE_BLOCK` transformer
// (`@/inkling/markdown/transformers`) is a typing-shortcut trigger whose regex
// never claims fences on import. The export reads `node.code` rather than
// `getTextContent()`, which pads word-count text (caption included) with
// trailing newlines. Ordered after the card transformers so
// ```inkling:<card>``` fences match their card transformer first.
const CODE_FENCE: MultilineElementTransformer = {
  dependencies: [CodeBlockNode],
  export: (node) => {
    if (!$isCodeBlockNode(node)) {
      return null
    }
    return codeBlockFence(node.language, node.code)
  },
  regExpEnd: FENCE_END_REGEXP,
  regExpStart: FENCE_IMPORT_REGEXP,
  replace: (rootNode, _children, startMatch, _endMatch, linesInBetween, _isImport) => {
    rootNode.append($createCodeBlockNode({ code: stripFenceLines(linesInBetween), language: startMatch[1] }))
  },
  type: 'multiline-element',
}

// GFM pipe-table transformer, hand-written: @lexical/markdown 0.53 ships no
// TABLE transformer — only the row/divider regexes that
// normalizeMarkdown uses. Import claims a header row only when a divider
// line follows it (otherwise the line stays a literal paragraph); cell
// markdown converts through the dialect's minimal inline-only set, so a
// cell can never grow block content. Export escapes pipes and always emits
// row 0 as the GFM header — GFM has no headerless tables.
const TABLE_ROW_REG_EXP = /^\|(.+)\|\s*$/

function splitTableRow(line: string): string[] {
  const match = TABLE_ROW_REG_EXP.exec(line)
  if (!match) {
    return []
  }
  // split on unescaped pipes only, then unescape `\|`
  return match[1].split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

const GFM_TABLE: MultilineElementTransformer = {
  dependencies: [TableNode],
  regExpStart: TABLE_ROW_REG_EXP,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    const divider = lines[startLineIndex + 1]
    if (divider === undefined || !isTableRowDivider(divider)) {
      return null
    }

    const headerCells = splitTableRow(lines[startLineIndex])
    const bodyRows: string[][] = []
    let endLineIndex = startLineIndex + 1
    while (endLineIndex + 1 < lines.length && TABLE_ROW_REG_EXP.test(lines[endLineIndex + 1])) {
      bodyRows.push(splitTableRow(lines[endLineIndex + 1]))
      endLineIndex += 1
    }

    const table = $createTableNode()
    const appendRow = (cells: string[], headerState: TableCellHeaderState) => {
      const row = $createTableRowNode()
      for (const cellText of cells) {
        const cell = $createTableCellNode(headerState)
        const paragraph = $createParagraphNode()
        $convertFromMarkdownString(cellText, MINIMAL_TRANSFORMERS, paragraph)
        cell.append(...paragraph.getChildren())
        row.append(cell)
      }
      table.append(row)
    }
    appendRow(headerCells, TableCellHeaderStates.ROW)
    bodyRows.forEach((cells) => appendRow(cells, TableCellHeaderStates.NO_STATUS))

    rootNode.append(table)
    return [true, endLineIndex]
  },
  // unreachable: handleImportAfterStartMatch always claims or declines
  replace: () => false,
  export: (node, exportChildren) => {
    if (!$isTableNode(node)) {
      return null
    }
    const rows = node.getChildren().filter($isTableRowNode)
    if (rows.length === 0) {
      return null
    }

    // the pipe-table shape is declared in @/inkling/nodes/table/table-facts
    return resolveGfmPipeTableLines(rows, (cell) =>
      exportChildren(cell).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim(),
    ).join('\n')
  },
  type: 'multiline-element',
}

// The one home of the transformer precedence rule: card fences (built-in,
// then host) match before GFM_TABLE and CODE_FENCE, so an inkling:<card>
// fence is always a card, never a code block. An unclosed ```inkling:xxx fence
// is malformed input no card transformer claims and imports as a code block
// with language 'inkling:xxx' — accepted tradeoff.
function buildTransformers(hostTransformers: Transformer[] = []): Transformer[] {
  return [...CARD_TRANSFORMERS, ...hostTransformers, GFM_TABLE, CODE_FENCE, ...DEFAULT_TRANSFORMERS]
}

const TRANSFORMERS: Transformer[] = buildTransformers()

/**
 * One host card's round-trip wiring: the assembled node class plus its fence
 * transformer when the spec declares `markdownFence`.
 */
interface HostRoundTripCard {
  node: Klass<LexicalNode>
  transformer?: MultilineElementTransformer
}

/**
 * The host cards the round-trip composes: every `defineCard`-registered card
 * joins by default (its assembled class registers on the conversion editor;
 * `markdownFence` derives its transformer from the stored spec through
 * `createCardTransformer`). The `cards` option AUGMENTS that default — it
 * exists for handles built WITHOUT `defineCard` — and on a nodeType collision
 * it replaces the registry-derived wiring for that type. There is deliberately
 * no opt-out flag: a registered card leaves the round-trip by not declaring
 * `markdownFence`.
 */
function resolveRoundTripHostCards(cards: readonly HostCard[]): HostRoundTripCard[] {
  const byType = new Map<string, HostRoundTripCard>()
  for (const record of getHostCards()) {
    const node = assembleCardNodeOnce<LexicalNode>(record.spec)
    byType.set(record.nodeType, {
      node,
      transformer: record.spec.markdownFence
        ? createCardTransformer({ card: record.nodeType, nodeClass: node, ...record.spec.markdownFence })
        : undefined,
    })
  }
  for (const card of cards) {
    byType.set(card.nodeType, { node: card.node, transformer: card.markdownTransformer })
  }
  return [...byType.values()]
}

/**
 * `cards` AUGMENTS the registry-default host wiring (see
 * `resolveRoundTripHostCards`): compose a HostCard handle built without
 * `defineCard`, or override a registered type's wiring.
 */
export interface MarkdownRoundTripOptions {
  cards?: readonly HostCard[]
}

function createMarkdownEditor(hostCards: readonly HostRoundTripCard[]) {
  return createHeadlessEditor({
    nodes: [...MARKDOWN_NODES, ...hostCards.map((card) => card.node)],
    onError(error) {
      throw error
    },
  })
}

// Host card fences join the card run — ahead of CODE_FENCE.
function resolveTransformers(hostCards: readonly HostRoundTripCard[]): Transformer[] {
  const hostTransformers = hostCards.flatMap((card) => (card.transformer ? [card.transformer] : []))
  if (hostTransformers.length === 0) {
    return TRANSFORMERS
  }
  return buildTransformers(hostTransformers)
}

/**
 * Convert a markdown string to a serialized Lexical editor state, through
 * `@lexical/markdown`'s `$convertFromMarkdownString`.
 */
export function markdownToLexicalState(
  markdown: string,
  options: MarkdownRoundTripOptions = {},
): SerializedEditorState {
  const hostCards = resolveRoundTripHostCards(options.cards ?? [])
  const editor = createMarkdownEditor(hostCards)

  editor.update(
    () => {
      $convertFromMarkdownString(markdown, resolveTransformers(hostCards))
    },
    { discrete: true },
  )

  return editor.getEditorState().toJSON()
}

/**
 * Convert a serialized Lexical editor state back to a markdown string, using
 * the same transformer set as `markdownToLexicalState`.
 */
export function lexicalStateToMarkdown(state: SerializedEditorState, options: MarkdownRoundTripOptions = {}): string {
  const hostCards = resolveRoundTripHostCards(options.cards ?? [])
  const editor = createMarkdownEditor(hostCards)

  editor.setEditorState(editor.parseEditorState(state))

  return editor.getEditorState().read(() => {
    return $convertToMarkdownString(resolveTransformers(hostCards))
  })
}
