import type { HostCard } from '@kobato/inkling-internal/nodes/cards/host-cards'
import type { Klass, LexicalNode, SerializedEditorState } from 'lexical'

import { codeBlockFence, stripFenceLines } from '@kobato/inkling-internal/markdown/card-shortcuts'
import { FENCE_END_REGEXP, FENCE_IMPORT_REGEXP } from '@kobato/inkling-internal/markdown/grammar'
import { DEFAULT_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers'
import { MINIMAL_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers-core'
import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import {
  $createMarkdownNode,
  $isMarkdownNode,
  MarkdownNode,
} from '@kobato/inkling-internal/nodes/base/nodes/markdown/MarkdownNode'
import {
  CARD_MARKDOWN_DECLARATIONS,
  createCardTransformer,
} from '@kobato/inkling-internal/nodes/cards/card-markdown-transformers'
import { getHostCards } from '@kobato/inkling-internal/nodes/cards/host-card-registry'
import { $createCodeBlockNode, $isCodeBlockNode, CodeBlockNode } from '@kobato/inkling-internal/nodes/CodeBlockNode'
import { resolveGfmPipeTableLines } from '@kobato/inkling-internal/nodes/table/table-facts'
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
} from '@kobato/inkling-internal/nodes/table/TableNodes'
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

const MARKDOWN_CARDS = CARD_MARKDOWN_DECLARATIONS.filter((card) => 'markdown' in card && card.markdown !== undefined)
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

const TABLE_ROW_REG_EXP = /^\|(.+)\|\s*$/

function splitTableRow(line: string): string[] {
  const match = TABLE_ROW_REG_EXP.exec(line)
  if (!match) {
    return []
  }

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
  replace: () => false,
  export: (node, exportChildren) => {
    if (!$isTableNode(node)) {
      return null
    }
    const rows = node.getChildren().filter($isTableRowNode)
    if (rows.length === 0) {
      return null
    }

    return resolveGfmPipeTableLines(rows, (cell) =>
      exportChildren(cell).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim(),
    ).join('\n')
  },
  type: 'multiline-element',
}

function buildTransformers(hostTransformers: Transformer[] = []): Transformer[] {
  return [...CARD_TRANSFORMERS, ...hostTransformers, GFM_TABLE, CODE_FENCE, ...DEFAULT_TRANSFORMERS]
}

const TRANSFORMERS: Transformer[] = buildTransformers()

interface HostRoundTripCard {
  node: Klass<LexicalNode>
  transformer?: MultilineElementTransformer
}

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

function resolveTransformers(hostCards: readonly HostRoundTripCard[]): Transformer[] {
  const hostTransformers = hostCards.flatMap((card) => (card.transformer ? [card.transformer] : []))
  if (hostTransformers.length === 0) {
    return TRANSFORMERS
  }
  return buildTransformers(hostTransformers)
}

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

export function lexicalStateToMarkdown(state: SerializedEditorState, options: MarkdownRoundTripOptions = {}): string {
  const hostCards = resolveRoundTripHostCards(options.cards ?? [])
  const editor = createMarkdownEditor(hostCards)

  editor.setEditorState(editor.parseEditorState(state))
  return editor.getEditorState().read(() => {
    return $convertToMarkdownString(resolveTransformers(hostCards))
  })
}
