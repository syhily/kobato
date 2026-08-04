import type { Block, NonRecursiveBlock, PortableTextBody, Span, TextBlock } from '@kobato/shared/legacy-pt/schema'

import { synchronizeFootnoteIndices } from '@kobato/shared/legacy-pt/footnote-sync'
import { portableTextBlockSemanticFingerprint } from '@kobato/shared/legacy-pt/semantics'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

/**
 * Canonicalise a PortableText body WITHOUT the PT↔PM bridge.
 *
 * The previous implementation round-tripped through ProseMirror
 * (`pmDocToBody(bodyToPmDoc(body))`), folding representational
 * differences as a side effect of the document-model conversion. This
 * module reproduces the same canonical shape directly on the PT tree so
 * the semantic-equality helper no longer depends on the editor's
 * document model (the bridge moves into the editor package while
 * `shared/` stays engine-free).
 *
 * Net effects reproduced from the PM round-trip:
 *
 * - list `level` is normalised (`Math.max(1, level ?? 1)`); skipped
 *   levels are filled with empty list items (the PM tree builder
 *   inserts intermediate empty `<li>`s, the flatten pass emits them
 *   back with explicit levels — the filled layers carry `bullet` kind
 *   except the streak root, which keeps the streak's kind)
 * - list-item `style` is forced to `'normal'` (a PM list item child is
 *   always a paragraph)
 * - `span.marks` empty arrays collapse to `undefined`; `markDefs` drop
 *   entries no span references (PM only carries used marks)
 * - footnote definition indices are renumbered by first citation order
 *   (`synchronizeFootnoteIndices`, shared with the editor hook)
 * - every other block type passes through unchanged (nested container
 *   children — solution / footnoteDefinition / twoColumn — are
 *   canonicalised recursively)
 */

function isListItem(block: Block): block is TextBlock & { listItem: 'bullet' | 'number' } {
  return block._type === 'block' && (block.listItem === 'bullet' || block.listItem === 'number')
}

function canonicalizeTextBlock(block: TextBlock): TextBlock {
  const usedKeys: string[] = []
  const children = (block.children ?? []).map((child): Span => {
    if (child._type !== 'span') {
      return child
    }
    for (const mark of child.marks ?? []) {
      if (!usedKeys.includes(mark)) {
        usedKeys.push(mark)
      }
    }
    if (child.marks !== undefined && child.marks.length === 0) {
      return { ...child, marks: undefined }
    }
    return child
  })
  const used = new Set(usedKeys)
  const markDefs = (block.markDefs ?? []).filter((def) => used.has(def._key))
  return {
    ...block,
    // A PM list item child is always a paragraph; the round-trip forces
    // list-item styles back to `normal`.
    style: isListItem(block) ? 'normal' : block.style,
    children,
    markDefs: markDefs.length > 0 ? markDefs : undefined,
  }
}

function canonicalizeNested(block: Block): Block {
  if (block._type === 'solution' || block._type === 'footnoteDefinition') {
    // The canonicaliser never introduces container blocks, so nested
    // children stay within the schema's `NonRecursiveBlock` bound —
    // same contract as `mapNestedBlocks` (see utils.ts).
    return {
      ...block,
      children: unsafeCast<NonRecursiveBlock[]>(canonicalizeBlocks(block.children)),
    }
  }
  if (block._type === 'twoColumn') {
    return {
      ...block,
      left: unsafeCast<NonRecursiveBlock[]>(canonicalizeBlocks(block.left)),
      right: unsafeCast<NonRecursiveBlock[]>(canonicalizeBlocks(block.right)),
    }
  }
  // Every other block type is a leaf (or already canonical) — pass through.
  return block
}

function canonicalizeBlocks(blocks: readonly Block[]): Block[] {
  const out: Block[] = []
  let i = 0
  let nextKey = 0
  const emptyListItem = (kind: 'bullet' | 'number', level: number): TextBlock => {
    nextKey += 1
    return {
      _type: 'block',
      _key: `canon-${nextKey.toString(36)}`,
      style: 'normal',
      listItem: kind,
      level,
      children: [],
    }
  }
  while (i < blocks.length) {
    const block = blocks[i]
    if (!isListItem(block)) {
      out.push(block._type === 'block' ? canonicalizeTextBlock(block) : canonicalizeNested(block))
      i += 1
      continue
    }
    // List streak: PortableText stores lists as a flat sequence of
    // `listItem` blocks; the PM round-trip nests them into a tree and
    // flattens back. Reproduce the flatten output directly.
    const rootKind = block.listItem
    const listKindAtLevel = new Map<number, 'bullet' | 'number'>([[1, rootKind]])
    const firstLevel = Math.max(1, block.level ?? 1)
    // A streak starting below the root gets empty ancestor items (the PM
    // builder nests the first block under empty root `<li>`s).
    if (firstLevel > 1) {
      out.push(emptyListItem(rootKind, 1))
      for (let L = 2; L < firstLevel; L++) {
        out.push(emptyListItem('bullet', L))
      }
    }
    let prevLevel = firstLevel
    while (i < blocks.length) {
      const cur = blocks[i]
      if (!isListItem(cur)) {
        break
      }
      const kind = cur.listItem
      const level = Math.max(1, cur.level ?? 1)
      const existing = listKindAtLevel.get(level)
      if (existing !== undefined && existing !== kind) {
        break
      }
      if (level === 1 && kind !== rootKind) {
        break
      }
      if (!listKindAtLevel.has(level)) {
        listKindAtLevel.set(level, kind)
      }
      // Fill skipped levels with empty bullet items (mirrors the PM tree
      // builder inserting intermediate empty `<li>`s).
      for (let L = prevLevel + 1; L < level; L++) {
        out.push(emptyListItem('bullet', L))
      }
      out.push(canonicalizeTextBlock({ ...cur, level }))
      prevLevel = level
      i += 1
    }
  }
  return out
}

/**
 * Canonical shape of a PortableText body — deterministic and idempotent,
 * without touching the editor document model.
 */
export function canonicalizePortableTextBodyShape(body: PortableTextBody): PortableTextBody {
  return synchronizeFootnoteIndices(canonicalizeBlocks(body))
}

/**
 * Semantic equality helper for conflict detection / "dirty" checks.
 *
 * Uses canonical PT forms so equivalent list shapes do not trigger
 * false-positive "content mismatch" prompts.
 *
 * Block-wise comparison matches the admin PortableText diff's anchor
 * construction (`portable-text-diff` ⇆ `@/shared/portable-text-semantics`):
 * `_key` regeneration, Postgres `jsonb` key reordering, omitted vs
 * present prerender artefacts (`highlightedHtml`, SVG), and markupDef
 * key reshuffles must not resurrect spurious mismatches versus what the
 * operator sees as UNCHANGED rows.
 */
export function arePortableTextBodiesEquivalent(left: PortableTextBody, right: PortableTextBody): boolean {
  const canonLeft = canonicalizePortableTextBodyShape(left)
  const canonRight = canonicalizePortableTextBodyShape(right)
  if (canonLeft.length !== canonRight.length) {
    return false
  }
  for (let i = 0; i < canonLeft.length; i++) {
    if (portableTextBlockSemanticFingerprint(canonLeft[i]) !== portableTextBlockSemanticFingerprint(canonRight[i])) {
      return false
    }
  }
  return true
}
