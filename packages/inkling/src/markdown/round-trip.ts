import type { SerializedEditorState } from 'lexical'

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

import type { HostCard } from '@/nodes/cards/host-cards'

import { codeBlockFence, stripFenceLines } from '@/markdown/card-shortcuts'
import { FENCE_END_REGEXP, FENCE_IMPORT_REGEXP } from '@/markdown/grammar'
import { DEFAULT_TRANSFORMERS } from '@/markdown/transformers'
import { MINIMAL_TRANSFORMERS } from '@/markdown/transformers-core'
import { $createMarkdownNode, $isMarkdownNode, MarkdownNode } from '@/nodes/base/nodes/markdown/MarkdownNode'
import { CARD_MARKDOWN_DECLARATIONS } from '@/nodes/cards/card-markdown-transformers'
import { deriveCardNodes } from '@/nodes/cards/derive-card-nodes'
import { $createCodeBlockNode, $isCodeBlockNode, CodeBlockNode } from '@/nodes/CodeBlockNode'
import { resolveGfmPipeTableLines } from '@/nodes/table/table-facts'
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
} from '@/nodes/table/TableNodes'

/**
 * The card-aware round-trip dialect — one of Inkling's two markdown dialects
 * (the paste dialect is `@/markdown/paste-dialect`) and the public markdown
 * import/export API (`markdownToLexicalState` / `lexicalStateToMarkdown`).
 *
 * What the dialect speaks: ```inkling:<card>``` fences, standard
 * `![alt](src)` image syntax, and the shared grammar table's inline
 * delimiters (`@/markdown/grammar`: `==mark==` rides upstream's
 * TEXT_FORMAT_TRANSFORMERS HIGHLIGHT, `~`/`^` sub/sup are projected in
 * `@/markdown/transformers-core`) — but not footnotes. Conversion runs
 * through `@lexical/markdown`'s `$convertFromMarkdownString` /
 * `$convertToMarkdownString` on a temporary headless editor with the
 * constrained node set below.
 */

// The markdown-eligible cards in declaration order — the same order the
// node sets compose. Transformer order among cards is unobservable (each
// card transformer's export matches only its own node type; the import
// regexes are per-card distinct), so no legacy rank is preserved; the
// pinned literal in test/unit/nodes/derived-node-sets.test.ts guards drift.
// MarkdownNode is a base-only node, not a card — it and
// MARKDOWN_CARD_TRANSFORMER stay manual.
const MARKDOWN_CARDS = deriveCardNodes(CARD_MARKDOWN_DECLARATIONS)

// Exported (not part of the public `@/markdown` barrel) so the node-set diff
// test can pin the derived arrays against the pre-refactor literals.
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

// Fenced code blocks are this dialect's grammar, so the dialect carries its
// own multiline transformer. The shared `CODE_BLOCK` element transformer
// (`@/markdown/transformers`) is a typing-shortcut trigger: its regex only
// fires on the trailing-space keystroke and deliberately never claims fences
// on import — which used to leave imported fences as literal paragraphs that
// export then re-escaped to \`\`\`. The export here reads `node.code` rather
// than `getTextContent()`, which pads word-count text (caption included)
// with trailing newlines. Ordered after the card transformers so
// ```inkling:<card>``` fences match their card transformer first.
const CODE_FENCE: MultilineElementTransformer = {
  dependencies: [CodeBlockNode],
  export: (node) => {
    if (!$isCodeBlockNode(node)) {
      return null
    }
    // the fence shape is single-sourced in the card-shortcut seam; this
    // transformer's variance is the text source (node.code)
    return codeBlockFence(node.language, node.code)
  },
  regExpEnd: FENCE_END_REGEXP,
  // the import policy lives in the shared grammar table (`@/markdown/grammar`):
  // language names are free input on export (codeBlockFence emits them
  // verbatim), so the import side must accept more than \w — c++,
  // shell-session, etc. used to fall back to literal paragraphs. Card fences
  // (```inkling:<card>```) still win: buildTransformers orders
  // CARD_TRANSFORMERS before CODE_FENCE. One accepted tradeoff: an unclosed
  // ```inkling:xxx fence is malformed input no card transformer claims, and
  // it now imports as a code block with language 'inkling:xxx' instead of a
  // literal paragraph.
  regExpStart: FENCE_IMPORT_REGEXP,
  replace: (rootNode, _children, startMatch, _endMatch, linesInBetween, _isImport) => {
    rootNode.append($createCodeBlockNode({ code: stripFenceLines(linesInBetween), language: startMatch[1] }))
  },
  type: 'multiline-element',
}

// GFM pipe-table transformer, hand-written: @lexical/markdown 0.46 ships no
// upstream TABLE transformer — only the row/divider regexes that
// normalizeMarkdown uses. Import claims a header row only when a divider
// line follows it (otherwise the line stays a literal paragraph); cell
// markdown converts through the dialect's minimal inline-only set, so a
// cell can never grow block content. Export escapes pipes and always emits
// row 0 as the GFM header — GFM has no headerless tables.
const TABLE_ROW_REG_EXP = /^\|(.+)\|\s*$/

function splitTableRow(line: string): string[] {
  const match = line.match(TABLE_ROW_REG_EXP)
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

    // the pipe-table shape — row 0 + divider + body — is declared in
    // @/nodes/table/table-facts (the GFM direction forges the header; the
    // HTML direction reads it)
    return resolveGfmPipeTableLines(rows, (cell) =>
      exportChildren(cell).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim(),
    ).join('\n')
  },
  type: 'multiline-element',
}

// The one home of the transformer precedence rule: card fences (built-in,
// then host) match before GFM_TABLE and CODE_FENCE, so an inkling:<card>
// fence is always a card, never a code block.
function buildTransformers(hostTransformers: Transformer[] = []): Transformer[] {
  return [...CARD_TRANSFORMERS, ...hostTransformers, GFM_TABLE, CODE_FENCE, ...DEFAULT_TRANSFORMERS]
}

const TRANSFORMERS: Transformer[] = buildTransformers()

/**
 * The options the round-trip pair accepts: `cards` composes host cards
 * (CONTEXT.md: "host card") into the conversion — their assembled node
 * classes join the editor's node set and their fence transformers join the
 * card transformer run, ordered before CODE_FENCE so `inkling:<card>` fences
 * match their card transformer first (the same precedence the built-in cards
 * get).
 */
export interface MarkdownRoundTripOptions {
  cards?: readonly HostCard[]
}

function createMarkdownEditor(cards: readonly HostCard[]) {
  return createHeadlessEditor({
    nodes: [...MARKDOWN_NODES, ...cards.map((card) => card.node)],
    onError(error) {
      throw error
    },
  })
}

// Host card fences join the card run — ahead of CODE_FENCE. With no host
// cards the shared constant is reused, so the default conversion is
// byte-identical to the pre-options behavior.
function resolveTransformers(cards: readonly HostCard[]): Transformer[] {
  if (cards.length === 0) {
    return TRANSFORMERS
  }
  const hostTransformers = cards.flatMap((card) => (card.markdownTransformer ? [card.markdownTransformer] : []))
  return buildTransformers(hostTransformers)
}

/**
 * Convert a markdown string to a serialized Lexical editor state.
 *
 * Uses `@lexical/markdown`'s `$convertFromMarkdownString` together with the
 * existing Inkling shortcut transformers (headings, lists, quotes, links, code
 * blocks, horizontal rules, sub/superscript, etc.).
 */
export function markdownToLexicalState(
  markdown: string,
  options: MarkdownRoundTripOptions = {},
): SerializedEditorState {
  const cards = options.cards ?? []
  const editor = createMarkdownEditor(cards)

  editor.update(
    () => {
      $convertFromMarkdownString(markdown, resolveTransformers(cards))
    },
    { discrete: true },
  )

  return editor.getEditorState().toJSON()
}

/**
 * Convert a serialized Lexical editor state back to a markdown string.
 *
 * Uses `@lexical/markdown`'s `$convertToMarkdownString` with the same
 * transformer set used by `markdownToLexicalState`.
 */
export function lexicalStateToMarkdown(state: SerializedEditorState, options: MarkdownRoundTripOptions = {}): string {
  const cards = options.cards ?? []
  const editor = createMarkdownEditor(cards)

  editor.setEditorState(editor.parseEditorState(state))

  return editor.getEditorState().read(() => {
    return $convertToMarkdownString(resolveTransformers(cards))
  })
}
