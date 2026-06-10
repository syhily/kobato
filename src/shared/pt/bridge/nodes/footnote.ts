/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { PmBlockNode, PmNode } from '@/shared/pt/bridge/types'
import type {
  Block,
  FootnoteDefinitionBlock,
  FootnoteRefMarkDef,
  MarkDef,
  NonRecursiveBlock,
  PortableTextBody,
  Span,
  TableCell,
} from '@/shared/pt/schema'

export function footnoteDefinitionBlockToPmNode(
  block: FootnoteDefinitionBlock,
  pushBlocks: (out: PmNode[], blocks: readonly Block[]) => void,
): PmBlockNode {
  const inner: PmNode[] = []
  pushBlocks(inner, block.children)
  if (inner.length === 0) {
    inner.push({ type: 'paragraph' })
  }
  return {
    type: 'footnoteDefinition',
    attrs: { _key: block._key, index: block.index },
    content: inner,
  }
}

function walkMainColumnFootnoteRefs(body: PortableTextBody, visit: (targetKey: string, index: number) => void): void {
  function scanSpans(spans: readonly Span[], markDefs: readonly MarkDef[] | undefined): void {
    if (markDefs === undefined || markDefs.length === 0) {
      return
    }
    const refByMarkKey = new Map<string, FootnoteRefMarkDef>()
    for (const m of markDefs) {
      if (m._type === 'footnoteRef') {
        refByMarkKey.set(m._key, m)
      }
    }
    for (const span of spans) {
      for (const mk of span.marks ?? []) {
        const def = refByMarkKey.get(mk)
        if (def !== undefined) {
          visit(def.targetKey, def.index)
        }
      }
    }
  }

  function visitNonRecursive(nr: NonRecursiveBlock): void {
    switch (nr._type) {
      case 'block':
        scanSpans(nr.children, nr.markDefs)
        return
      case 'table':
        for (const row of nr.rows ?? []) {
          for (const cell of row.cells) {
            scanSpans(cell.content, cell.markDefs ?? [])
          }
        }
        return
      // Leaf blocks that cannot host footnote refs — explicit no-op
      // keeps `switch-exhaustiveness-check` happy without a default.
      case 'code':
      case 'horizontalRule':
      case 'image':
      case 'mathBlock':
      case 'musicPlayer':
        return
    }
  }

  for (const block of body) {
    if (block._type === 'footnoteDefinition') {
      continue
    }
    if (block._type === 'solution') {
      for (const child of block.children) {
        visitNonRecursive(child)
      }
      continue
    }
    if (block._type === 'twoColumn') {
      for (const child of block.left) {
        visitNonRecursive(child)
      }
      for (const child of block.right) {
        visitNonRecursive(child)
      }
      continue
    }
    visitNonRecursive(block as NonRecursiveBlock)
  }
}

function collectReferencedFootnoteTargetKeys(body: PortableTextBody): Set<string> {
  const keys = new Set<string>()
  walkMainColumnFootnoteRefs(body, (targetKey) => {
    keys.add(targetKey)
  })
  return keys
}

/** Definition `_key` values in **first citation order** (main column + solutions), then orphan defs. */
function collectFootnoteCitationOrder(body: PortableTextBody): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  walkMainColumnFootnoteRefs(body, (targetKey) => {
    if (seen.has(targetKey)) {
      return
    }
    seen.add(targetKey)
    order.push(targetKey)
  })
  for (const block of body) {
    if (block._type === 'footnoteDefinition' && !seen.has(block._key)) {
      seen.add(block._key)
      order.push(block._key)
    }
  }
  return order
}

/** Snapshot of inline footnote markers + definition indices for editor reconciliation. */
export function footnoteSyncSignature(body: PortableTextBody): string {
  const occurrences: string[] = []
  walkMainColumnFootnoteRefs(body, (targetKey, index) => {
    occurrences.push(`${targetKey}:${index}`)
  })
  const defs = body
    .filter((b): b is FootnoteDefinitionBlock => b._type === 'footnoteDefinition')
    .map((b) => `${b._key}@${b.index}`)
    .sort()
  return `${occurrences.join('\u001f')}\u001e${defs.join('\u001f')}`
}

function syncMarkDefs(markDefs: MarkDef[] | undefined, keyToIndex: Map<string, number>): MarkDef[] | undefined {
  if (markDefs === undefined || markDefs.length === 0) {
    return markDefs
  }
  return markDefs.map((m) => {
    if (m._type !== 'footnoteRef') {
      return m
    }
    const idx = keyToIndex.get(m.targetKey)
    if (idx === undefined) {
      return m
    }
    if (m.index === idx) {
      return m
    }
    return { ...m, index: idx }
  })
}

function syncFootnoteDigitsInSpans(
  spans: readonly Span[],
  markDefs: readonly MarkDef[] | undefined,
  keyToIndex: Map<string, number>,
): Span[] {
  if (markDefs === undefined || markDefs.length === 0) {
    return [...spans]
  }
  const refByMarkKey = new Map<string, FootnoteRefMarkDef>()
  for (const m of markDefs) {
    if (m._type === 'footnoteRef') {
      refByMarkKey.set(m._key, m)
    }
  }
  if (refByMarkKey.size === 0) {
    return [...spans]
  }
  return spans.map((span) => {
    for (const mk of span.marks ?? []) {
      const def = refByMarkKey.get(mk)
      if (def !== undefined) {
        const idx = keyToIndex.get(def.targetKey) ?? def.index
        return { ...span, text: String(idx) }
      }
    }
    return span
  })
}

function syncBlock(block: Block, keyToIndex: Map<string, number>): Block {
  switch (block._type) {
    case 'footnoteDefinition': {
      const idx = keyToIndex.get(block._key)
      const index = idx ?? block.index
      return {
        ...block,
        index,
        children: block.children.map((c) => syncBlock(c, keyToIndex)) as FootnoteDefinitionBlock['children'],
      }
    }
    case 'solution':
      return {
        ...block,
        children: block.children.map((c) => syncBlock(c, keyToIndex)) as FootnoteDefinitionBlock['children'],
      }
    case 'twoColumn':
      return {
        ...block,
        left: block.left.map((c) => syncBlock(c, keyToIndex)) as FootnoteDefinitionBlock['children'],
        right: block.right.map((c) => syncBlock(c, keyToIndex)) as FootnoteDefinitionBlock['children'],
      }
    case 'block': {
      const nextDefs = syncMarkDefs(block.markDefs, keyToIndex)
      return {
        ...block,
        markDefs: nextDefs,
        children: syncFootnoteDigitsInSpans(block.children, nextDefs, keyToIndex),
      }
    }
    case 'table':
      return {
        ...block,
        rows: block.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) => {
            const nextCellDefs = syncMarkDefs(cell.markDefs, keyToIndex) as TableCell['markDefs']
            return {
              ...cell,
              markDefs: nextCellDefs,
              content: syncFootnoteDigitsInSpans(cell.content, nextCellDefs ?? undefined, keyToIndex),
            }
          }),
        })),
      }
    // Leaf blocks carry no footnote refs — return unchanged.
    case 'code':
    case 'horizontalRule':
    case 'image':
    case 'mathBlock':
    case 'musicPlayer':
      return block
  }
}

/** Renumber `footnoteDefinition.index` + `footnoteRef.index` by **first citation order** in the main column (and solutions). Appends orphan defs. Skips when there are no defs or a ref targets a missing definition (preserves prose-only round-trips). */
export function synchronizeFootnoteIndices(body: PortableTextBody): PortableTextBody {
  const defKeys = new Set(
    body.filter((b): b is FootnoteDefinitionBlock => b._type === 'footnoteDefinition').map((b) => b._key),
  )
  if (defKeys.size === 0) {
    return body
  }
  const referenced = collectReferencedFootnoteTargetKeys(body)
  for (const key of referenced) {
    if (!defKeys.has(key)) {
      return body
    }
  }
  const order = collectFootnoteCitationOrder(body)
  if (order.length === 0) {
    return body
  }
  const keyToIndex = new Map(order.map((k, i) => [k, i + 1]))
  const synced = body.map((b) => syncBlock(b, keyToIndex))
  const defs = synced.filter((b): b is FootnoteDefinitionBlock => b._type === 'footnoteDefinition')
  const prose = synced.filter((b) => b._type !== 'footnoteDefinition')
  defs.sort((a, b) => a.index - b.index)
  return [...prose, ...defs]
}
