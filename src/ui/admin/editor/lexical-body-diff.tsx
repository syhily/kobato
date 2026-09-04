import { diff_match_patch } from 'diff-match-patch'

import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'

import { lexicalNodeFingerprint } from '@/shared/lexical/equivalence'
import { lexicalNodeTextContent } from '@/shared/lexical/walk'
import { Badge } from '@/ui/components/badge'
import { cn } from '@/ui/lib/cn'

// Lexical counterpart of the PT-era `portable-text-diff`: diffs the top-level
// children of two editor states. Lexical's serialized nodes carry no stable
// `_key`, so 'unchanged' anchors are semantic fingerprints and 'changed'
// pairing falls back on same-type + text similarity.

export interface DiffEntry {
  key: string
  status: 'unchanged' | 'changed' | 'leftOnly' | 'rightOnly'
  leftNode: LexicalNodeJson | null
  rightNode: LexicalNodeJson | null
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

export function diffBodies(leftBody: LexicalEditorState, rightBody: LexicalEditorState): DiffEntry[] {
  const leftNodes = leftBody.root.children
  const rightNodes = rightBody.root.children
  const leftAnchors = leftNodes.map((node) => lexicalNodeFingerprint(node))
  const rightAnchors = rightNodes.map((node) => lexicalNodeFingerprint(node))
  const matches = lcsMatches(leftAnchors, rightAnchors)

  const entries: DiffEntry[] = []
  let li = 0
  let ri = 0
  for (const [matchedLeft, matchedRight] of matches) {
    flushGap(leftNodes.slice(li, matchedLeft), rightNodes.slice(ri, matchedRight), entries)
    const left = leftNodes[matchedLeft]
    const right = rightNodes[matchedRight]
    entries.push({ key: leftAnchors[matchedLeft], status: 'unchanged', leftNode: left, rightNode: right })
    li = matchedLeft + 1
    ri = matchedRight + 1
  }
  flushGap(leftNodes.slice(li), rightNodes.slice(ri), entries)
  return entries
}

function flushGap(leftGap: LexicalNodeJson[], rightGap: LexicalNodeJson[], entries: DiffEntry[]): void {
  const pairs = Math.min(leftGap.length, rightGap.length)
  let paired = 0
  while (paired < pairs) {
    const left = leftGap[paired]
    const right = rightGap[paired]
    if (!shouldPairAsChanged(left, right)) {
      break
    }
    entries.push({ key: lexicalNodeFingerprint(left), status: 'changed', leftNode: left, rightNode: right })
    paired += 1
  }
  for (let i = paired; i < leftGap.length; i++) {
    const node = leftGap[i]
    entries.push({ key: lexicalNodeFingerprint(node), status: 'leftOnly', leftNode: node, rightNode: null })
  }
  for (let i = paired; i < rightGap.length; i++) {
    const node = rightGap[i]
    entries.push({ key: lexicalNodeFingerprint(node), status: 'rightOnly', leftNode: null, rightNode: node })
  }
}

function shouldPairAsChanged(left: LexicalNodeJson, right: LexicalNodeJson): boolean {
  if (left.type !== right.type) {
    return false
  }
  const leftText = lexicalNodeTextContent(left).trim()
  const rightText = lexicalNodeTextContent(right).trim()
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
        const leftCell = dp[(i - 1) * stride + (j - 1)]
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

export interface DiffPanelProps {
  diff: DiffEntry[]
  /** Which side of each diff entry to render in this panel. */
  side: 'left' | 'right'
}

export function DiffPanel({ diff, side }: DiffPanelProps) {
  return (
    <ol className="flex flex-col gap-2">
      {diff.map((entry, idx) => {
        const node = side === 'left' ? entry.leftNode : entry.rightNode
        const onlyOtherSide =
          (side === 'left' && entry.status === 'rightOnly') || (side === 'right' && entry.status === 'leftOnly')
        if (onlyOtherSide) {
          return (
            <li
              // `idx` disambiguates repeat fingerprints (two identical paragraphs).
              // oxlint-disable-next-line react/no-array-index-key
              key={`${idx}-${entry.status}`}
              className="rounded border border-dashed border-muted bg-muted/30 px-2 py-2 text-xs text-muted-foreground"
            >
              （无）
            </li>
          )
        }
        return (
          <li
            // oxlint-disable-next-line react/no-array-index-key
            key={`${idx}-${entry.status}`}
            className={cn(
              'rounded border px-2 py-2 text-sm',
              entry.status === 'unchanged' && 'border-muted bg-muted/30',
              entry.status === 'changed' && 'border-diff-change-border bg-diff-change-bg',
              entry.status === 'leftOnly' && side === 'left' && 'border-diff-delete-border bg-diff-delete-bg',
              entry.status === 'rightOnly' && side === 'right' && 'border-diff-insert-border bg-diff-insert-bg',
            )}
          >
            <div className="mb-1 flex items-center gap-2">
              <NodeTypeBadge node={node} />
              <span className="text-badge tracking-wide text-muted-foreground uppercase">{entry.status}</span>
            </div>
            {entry.status === 'changed' && entry.leftNode && entry.rightNode ? (
              <NodeInlineDiff leftNode={entry.leftNode} rightNode={entry.rightNode} side={side} />
            ) : (
              <NodePreview node={node} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function NodeTypeBadge({ node }: { node: LexicalNodeJson | null }) {
  if (node === null) {
    return null
  }
  return <Badge variant="outline">{node.type}</Badge>
}

interface NodeInlineDiffProps {
  leftNode: LexicalNodeJson
  rightNode: LexicalNodeJson
  side: 'left' | 'right'
}

function NodeInlineDiff({ leftNode, rightNode, side }: NodeInlineDiffProps) {
  const leftText = lexicalNodeTextContent(leftNode).trim()
  const rightText = lexicalNodeTextContent(rightNode).trim()
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

function NodePreview({ node }: { node: LexicalNodeJson | null }) {
  if (node === null) {
    return <span className="text-xs text-muted-foreground">（空）</span>
  }
  const text = lexicalNodeTextContent(node).trim()
  if (text !== '') {
    return <span className="line-clamp-3 wrap-break-word">{text}</span>
  }
  return (
    <pre className="line-clamp-3 text-xs break-all text-muted-foreground">{JSON.stringify(node).slice(0, 240)}</pre>
  )
}
