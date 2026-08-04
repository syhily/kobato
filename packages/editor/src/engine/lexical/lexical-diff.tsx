import type {
  LexicalBlockNode,
  LexicalBody,
  LexicalInlineNode,
  LexicalListItemNode,
  LexicalListNode,
} from '@kobato/shared/lexical/schema'

import { Badge } from '@kobato/editor/engine/components/badge'
import { cn } from '@kobato/editor/engine/lib/cn'
import { diff_match_patch } from 'diff-match-patch'

// Lexical body diff for the draft-conflict dialog and the revision
// history drawer — the Lexical successor of
// `@kobato/editor/engine/portable-text-diff`. The PT version anchored on
// block `_key`s (stable block identity); Lexical blocks carry no such
// key, so anchoring is STRUCTURAL:
//
//   - anchor fingerprint = `type + '\u0000' + plainText` (the per-block
//     plain-text projection of `shared/lexical/walk.ts` semantics)
//   - exact anchor matches align via LCS over the top-level block list
//   - gaps between matches pair up as `changed` when the block types
//     match AND the text similarity is ≥ 0.5 (the same pairing rule as
//     the PT diff's `_key`-less branch), otherwise they degrade to
//     `leftOnly` / `rightOnly` runs
//   - entry keys are structural indices (`L<i>:R<j>` for matches,
//     `gap<i>` for unmatched runs) — stable per diff computation, used
//     only as React list keys
//
// The rendered UI (status badges, add/remove tinting, inline char diff
// for paragraph-like blocks) is kept identical to the PT version.

export interface LexicalDiffEntry {
  /** Structural key: `L<i>:R<j>` for LCS matches, `gap<i>` for gap runs. */
  key: string
  status: 'unchanged' | 'changed' | 'leftOnly' | 'rightOnly'
  leftBlock: LexicalBlockNode | null
  rightBlock: LexicalBlockNode | null
}

const dmp = new diff_match_patch()

interface InlineDiffPart {
  op: -1 | 0 | 1
  text: string
}

export function inlineCharDiff(left: string, right: string): InlineDiffPart[] {
  const result = dmp.diff_main(left, right)
  dmp.diff_cleanupSemantic(result)
  return result.map(([op, text]) => ({ op: op === -1 ? -1 : op === 1 ? 1 : 0, text }))
}

export function diffLexicalBodies(leftBody: LexicalBody, rightBody: LexicalBody): LexicalDiffEntry[] {
  const leftBlocks = leftBody.root.children
  const rightBlocks = rightBody.root.children
  const leftAnchors = leftBlocks.map(anchorFor)
  const rightAnchors = rightBlocks.map(anchorFor)
  const matches = lcsMatches(leftAnchors, rightAnchors)

  const entries: LexicalDiffEntry[] = []
  let li = 0
  let ri = 0
  let gapIndex = 0
  for (const [matchedLeft, matchedRight] of matches) {
    flushGap(leftBlocks.slice(li, matchedLeft), rightBlocks.slice(ri, matchedRight), entries, gapIndex)
    gapIndex += 1
    const left = leftBlocks[matchedLeft]
    const right = rightBlocks[matchedRight]
    entries.push({
      key: `L${matchedLeft}:R${matchedRight}`,
      status: 'unchanged',
      leftBlock: left,
      rightBlock: right,
    })
    li = matchedLeft + 1
    ri = matchedRight + 1
  }
  flushGap(leftBlocks.slice(li), rightBlocks.slice(ri), entries, gapIndex)
  return entries
}

function flushGap(
  leftGap: LexicalBlockNode[],
  rightGap: LexicalBlockNode[],
  entries: LexicalDiffEntry[],
  gapIndex: number,
): void {
  const pairs = Math.min(leftGap.length, rightGap.length)
  let paired = 0
  while (paired < pairs) {
    const left = leftGap[paired]
    const right = rightGap[paired]
    if (!shouldPairAsChanged(left, right)) {
      break
    }
    entries.push({ key: `gap${gapIndex}-${paired}`, status: 'changed', leftBlock: left, rightBlock: right })
    paired += 1
  }
  for (let i = paired; i < leftGap.length; i++) {
    const block = leftGap[i]
    entries.push({ key: `gap${gapIndex}-left${i}`, status: 'leftOnly', leftBlock: block, rightBlock: null })
  }
  for (let i = paired; i < rightGap.length; i++) {
    const block = rightGap[i]
    entries.push({ key: `gap${gapIndex}-right${i}`, status: 'rightOnly', leftBlock: null, rightBlock: block })
  }
}

// --- anchoring ----------------------------------------------------------------

/** Structural anchor: block type + plain-text projection (no stable key exists). */
function anchorFor(block: LexicalBlockNode): string {
  return `${block.type}\u0000${blockPlainText(block)}`
}

function shouldPairAsChanged(left: LexicalBlockNode, right: LexicalBlockNode): boolean {
  if (left.type !== right.type) {
    return false
  }
  const leftText = blockPlainText(left).trim()
  const rightText = blockPlainText(right).trim()
  return textSimilarity(leftText, rightText) >= 0.5
}

function textSimilarity(a: string, b: string): number {
  if (a === b) {
    return 1
  }
  if (a === '' || b === '') {
    return 0
  }
  const aTokens = tokenize(a)
  const bTokens = tokenize(b)
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0
  }
  let intersection = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection += 1
    }
  }
  return (2 * intersection) / (aTokens.size + bTokens.size)
}

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>()
  for (const word of text.toLowerCase().split(/[\s\p{P}]+/u)) {
    if (word !== '') {
      tokens.add(word)
    }
  }
  const cjk = text.match(/[\p{Script=Han}]+/gu) ?? []
  for (const run of cjk) {
    for (let i = 0; i < run.length - 1; i++) {
      tokens.add(run.slice(i, i + 2))
    }
    if (run.length === 1) {
      tokens.add(run)
    }
  }
  return tokens
}

function lcsMatches(left: readonly string[], right: readonly string[]): Array<[number, number]> {
  const n = left.length
  const m = right.length
  if (n === 0 || m === 0) {
    return []
  }
  const dp: number[] = Array.from({ length: (n + 1) * (m + 1) }, () => 0)
  const stride = m + 1
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (left[i - 1] === right[j - 1]) {
        dp[i * stride + j] = dp[(i - 1) * stride + (j - 1)] + 1
      } else {
        const up = dp[(i - 1) * stride + j]
        const leftCell = dp[i * stride + (j - 1)]
        dp[i * stride + j] = up >= leftCell ? up : leftCell
      }
    }
  }
  const matches: Array<[number, number]> = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (left[i - 1] === right[j - 1]) {
      matches.push([i - 1, j - 1])
      i -= 1
      j -= 1
    } else if (dp[(i - 1) * stride + j] >= dp[i * stride + (j - 1)]) {
      i -= 1
    } else {
      j -= 1
    }
  }
  matches.reverse()
  return matches
}

// --- plain-text projection (per block, mirroring `shared/lexical/walk.ts`) ----

function blockPlainText(node: LexicalBlockNode): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return inlineText(node.children)
    case 'quote':
      return node.children.map((child) => inlineText(child.children)).join('\n')
    case 'list':
      return node.children.map(listItemText).join('\n')
    case 'code':
      return node.children.map((child) => child.text).join('')
    case 'image':
      return node.alt ?? ''
    case 'mathBlock':
      return node.tex
    case 'musicPlayer':
      return `[Music: ${node.playerId}]`
    case 'horizontalrule':
      return '---'
    case 'table':
      return node.children
        .flatMap((row) => row.children.flatMap((cell) => cell.children.flatMap((p) => inlineText(p.children))))
        .join('\n')
    case 'solution':
      return node.children.map(blockPlainText).join('\n')
    case 'twoColumn':
      return node.children.map((pane) => pane.children.map(blockPlainText).join('\n')).join('\n')
    case 'footnoteDefinition':
      return node.children.map(blockPlainText).join('\n')
  }
}

function listItemText(node: LexicalListItemNode): string {
  return node.children
    .map((child) => {
      if (child.type === 'list') {
        return listBlockText(child)
      }
      if (child.type === 'paragraph') {
        return inlineText(child.children)
      }
      return inlineText([child])
    })
    .join('\n')
}

function listBlockText(node: LexicalListNode): string {
  return node.children.map(listItemText).join('\n')
}

function inlineText(nodes: readonly LexicalInlineNode[]): string {
  let out = ''
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out += node.text
        break
      case 'linebreak':
        out += '\n'
        break
      case 'link':
        out += inlineText(node.children)
        break
      case 'footnoteRef':
        out += String(node.index)
        break
      case 'mathInline':
        // The displayed glyph is the TeX source; contribute nothing.
        break
    }
  }
  return out
}

// --- rendering ------------------------------------------------------------------

export interface LexicalDiffPanelProps {
  diff: LexicalDiffEntry[]
  /** Which side of each diff entry to render in this panel. */
  side: 'left' | 'right'
}

export function LexicalDiffPanel({ diff, side }: LexicalDiffPanelProps) {
  return (
    <ol className="flex flex-col gap-2">
      {diff.map((entry, idx) => {
        const block = side === 'left' ? entry.leftBlock : entry.rightBlock
        const onlyOtherSide =
          (side === 'left' && entry.status === 'rightOnly') || (side === 'right' && entry.status === 'leftOnly')
        if (onlyOtherSide) {
          return (
            <li
              // oxlint-disable-next-line react/no-array-index-key
              key={`${entry.key}-${idx}`}
              className="rounded border border-dashed border-muted bg-muted/30 px-2 py-2 text-xs text-muted-foreground"
            >
              （无）
            </li>
          )
        }
        return (
          <li
            // oxlint-disable-next-line react/no-array-index-key
            key={`${entry.key}-${idx}`}
            className={cn(
              'rounded border px-2 py-2 text-sm',
              entry.status === 'unchanged' && 'border-muted bg-muted/30',
              entry.status === 'changed' && 'border-diff-change-border bg-diff-change-bg',
              entry.status === 'leftOnly' && side === 'left' && 'border-diff-delete-border bg-diff-delete-bg',
              entry.status === 'rightOnly' && side === 'right' && 'border-diff-insert-border bg-diff-insert-bg',
            )}
          >
            <div className="mb-1 flex items-center gap-2">
              <BlockTypeBadge block={block} />
              <span className="text-badge tracking-wide text-muted-foreground uppercase">{entry.status}</span>
            </div>
            {entry.status === 'changed' &&
            isTextCarryingBlock(entry.leftBlock) &&
            isTextCarryingBlock(entry.rightBlock) ? (
              <BlockInlineDiff leftBlock={entry.leftBlock} rightBlock={entry.rightBlock} side={side} />
            ) : (
              <BlockPreview block={block} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Paragraph-like blocks whose change is best shown as a char-level diff. */
function isTextCarryingBlock(
  block: LexicalBlockNode | null,
): block is Extract<LexicalBlockNode, { type: 'paragraph' | 'heading' }> {
  return block !== null && (block.type === 'paragraph' || block.type === 'heading')
}

function BlockTypeBadge({ block }: { block: LexicalBlockNode | null }) {
  if (block === null) {
    return null
  }
  return <Badge variant="outline">{block.type}</Badge>
}

interface BlockInlineDiffProps {
  leftBlock: Extract<LexicalBlockNode, { type: 'paragraph' | 'heading' }>
  rightBlock: Extract<LexicalBlockNode, { type: 'paragraph' | 'heading' }>
  side: 'left' | 'right'
}

function BlockInlineDiff({ leftBlock, rightBlock, side }: BlockInlineDiffProps) {
  const leftText = blockPlainText(leftBlock).trim()
  const rightText = blockPlainText(rightBlock).trim()
  const parts = inlineCharDiff(leftText, rightText)
  return (
    <p className="line-clamp-6 leading-relaxed wrap-break-word">
      {parts.map((part, idx) => {
        if (part.op === 0) {
          // oxlint-disable-next-line react/no-array-index-key
          return <span key={idx}>{part.text}</span>
        }
        if (side === 'right' && part.op === 1) {
          return (
            // oxlint-disable-next-line react/no-array-index-key
            <span key={idx} className="rounded bg-diff-insert-bg px-0.5 text-diff-insert-fg">
              {part.text}
            </span>
          )
        }
        if (side === 'left' && part.op === -1) {
          return (
            // oxlint-disable-next-line react/no-array-index-key
            <span key={idx} className="rounded bg-diff-delete-bg px-0.5 text-diff-delete-fg line-through">
              {part.text}
            </span>
          )
        }
        return null
      })}
    </p>
  )
}

function BlockPreview({ block }: { block: LexicalBlockNode | null }) {
  if (block === null) {
    return <span className="text-xs text-muted-foreground">（空）</span>
  }
  if (block.type === 'paragraph' || block.type === 'heading') {
    const text = blockPlainText(block).trim()
    return <span className="line-clamp-3 wrap-break-word">{text || '（空文本块）'}</span>
  }
  return (
    <pre className="line-clamp-3 text-xs break-all text-muted-foreground">{JSON.stringify(block).slice(0, 240)}</pre>
  )
}
