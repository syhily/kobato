import { diff_match_patch } from 'diff-match-patch'

import type { Block, PortableTextBody } from '@/shared/pt/schema'

import { portableTextBlockSemanticFingerprint as anchorFor } from '@/shared/pt/semantics'
import { bodyToPlainText } from '@/shared/pt/utils'
import { Badge } from '@/ui/components/badge'
import { cn } from '@/ui/lib/cn'

export interface DiffEntry {
  key: string
  status: 'unchanged' | 'changed' | 'leftOnly' | 'rightOnly'
  leftBlock: Block | null
  rightBlock: Block | null
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

export function diffBodies(leftBody: PortableTextBody, rightBody: PortableTextBody): DiffEntry[] {
  const leftAnchors = leftBody.map((block) => anchorFor(block))
  const rightAnchors = rightBody.map((block) => anchorFor(block))
  const matches = lcsMatches(leftAnchors, rightAnchors)

  const entries: DiffEntry[] = []
  let li = 0
  let ri = 0
  for (const [matchedLeft, matchedRight] of matches) {
    flushGap(leftBody.slice(li, matchedLeft), rightBody.slice(ri, matchedRight), entries)
    const left = leftBody[matchedLeft]
    const right = rightBody[matchedRight]
    entries.push({ key: left._key, status: 'unchanged', leftBlock: left, rightBlock: right })
    li = matchedLeft + 1
    ri = matchedRight + 1
  }
  flushGap(leftBody.slice(li), rightBody.slice(ri), entries)
  return entries
}

function flushGap(leftGap: Block[], rightGap: Block[], entries: DiffEntry[]): void {
  const pairs = Math.min(leftGap.length, rightGap.length)
  let paired = 0
  while (paired < pairs) {
    const left = leftGap[paired]
    const right = rightGap[paired]
    if (!shouldPairAsChanged(left, right)) {
      break
    }
    entries.push({ key: left._key, status: 'changed', leftBlock: left, rightBlock: right })
    paired += 1
  }
  for (let i = paired; i < leftGap.length; i++) {
    const block = leftGap[i]
    entries.push({ key: block._key, status: 'leftOnly', leftBlock: block, rightBlock: null })
  }
  for (let i = paired; i < rightGap.length; i++) {
    const block = rightGap[i]
    entries.push({ key: block._key, status: 'rightOnly', leftBlock: null, rightBlock: block })
  }
}

function shouldPairAsChanged(left: Block, right: Block): boolean {
  if (left._type !== right._type) {
    return false
  }
  if (left._key === right._key) {
    return true
  }
  if (left._type === 'block' && right._type === 'block') {
    const leftText = bodyToPlainText([left]).trim()
    const rightText = bodyToPlainText([right]).trim()
    return textSimilarity(leftText, rightText) >= 0.5
  }
  return false
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

export interface DiffPanelProps {
  diff: DiffEntry[]
  /** Which side of each diff entry to render in this panel. */
  side: 'left' | 'right'
}

export function DiffPanel({ diff, side }: DiffPanelProps) {
  return (
    <ol className="flex flex-col gap-2">
      {diff.map((entry, idx) => {
        const block = side === 'left' ? entry.leftBlock : entry.rightBlock
        const onlyOtherSide =
          (side === 'left' && entry.status === 'rightOnly') || (side === 'right' && entry.status === 'leftOnly')
        if (onlyOtherSide) {
          return (
            <li
              // `entry.key` is the diff entry's PT-block `_key`. The idx
              // suffix disambiguates the rare case where the same `_key`
              // appears twice in the same diff (move + edit pair).
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
            {entry.status === 'changed' && entry.leftBlock?._type === 'block' && entry.rightBlock?._type === 'block' ? (
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

function BlockTypeBadge({ block }: { block: Block | null }) {
  if (block === null) {
    return null
  }
  return <Badge variant="outline">{block._type}</Badge>
}

interface BlockInlineDiffProps {
  leftBlock: Block
  rightBlock: Block
  side: 'left' | 'right'
}

function BlockInlineDiff({ leftBlock, rightBlock, side }: BlockInlineDiffProps) {
  const leftText = bodyToPlainText([leftBlock]).trim()
  const rightText = bodyToPlainText([rightBlock]).trim()
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

function BlockPreview({ block }: { block: Block | null }) {
  if (block === null) {
    return <span className="text-xs text-muted-foreground">（空）</span>
  }
  if (block._type === 'block') {
    const text = bodyToPlainText([block]).trim()
    return <span className="line-clamp-3 wrap-break-word">{text || '（空文本块）'}</span>
  }
  return (
    <pre className="line-clamp-3 text-xs break-all text-muted-foreground">{JSON.stringify(block).slice(0, 240)}</pre>
  )
}
