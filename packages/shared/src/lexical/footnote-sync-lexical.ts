import type {
  LexicalBlockNode,
  LexicalBody,
  LexicalFootnoteDefinitionNode,
  LexicalInlineNode,
  LexicalNode,
  LexicalSimpleInlineNode,
} from '@kobato/shared/lexical/schema'

import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

// Pure-JSON footnote renumbering engine for `LexicalBody` — the
// lexical-track counterpart of `synchronizeFootnoteIndices`
// (`@kobato/shared/pt/footnote-sync`), ported semantics-for-semantics:
//
//   - citation order walks the MAIN column only: root-level blocks in
//     order, descending into `solution` children, `twoColumn` panes
//     (left then right) and `table` cells, but NEVER into
//     `footnoteDefinition` subtrees
//   - every `footnoteRef` (main column AND definition-nested) is
//     renumbered to its target definition's new index
//   - definitions are renumbered in first-citation order; orphan
//     definitions (never cited) are appended after the cited ones, in
//     body order
//   - definitions move to the END of the body, sorted by index
//   - guards mirror the PT engine: no definitions → unchanged; a ref
//     targeting a missing definition → unchanged
//
// The engine is pure: it never mutates the input body — the early-exit
// guards return the input reference unchanged, the rewrite path always
// produces a new body.

function walkMainColumnFootnoteRefs(body: LexicalBody, visit: (targetKey: string, index: number) => void): void {
  function scanInline(nodes: readonly LexicalInlineNode[]): void {
    for (const node of nodes) {
      if (node.type === 'footnoteRef') {
        visit(node.targetKey, node.index)
      } else if (node.type === 'link') {
        scanInline(node.children)
      }
    }
  }

  // Walks any node list generically — block containers, list items,
  // quote paragraphs and table cells all share the element shape.
  function scanNodes(nodes: readonly LexicalNode[]): void {
    for (const node of nodes) {
      switch (node.type) {
        case 'paragraph':
        case 'heading':
          scanInline(node.children)
          continue
        case 'quote':
        case 'list':
        case 'listitem':
          scanNodes(node.children)
          continue
        case 'table':
          for (const row of node.children) {
            for (const cell of row.children) {
              for (const paragraph of cell.children) {
                scanInline(paragraph.children)
              }
            }
          }
          continue
        // Leaf blocks that cannot host footnote refs — explicit no-op
        // keeps `switch-exhaustiveness-check` happy without a default.
        case 'code':
        case 'horizontalrule':
        case 'image':
        case 'mathBlock':
        case 'musicPlayer':
        case 'link':
        case 'linebreak':
        case 'mathInline':
        case 'text':
        case 'footnoteRef':
        case 'solution':
        case 'twoColumn':
        case 'twoColumnPane':
        case 'footnoteDefinition':
          continue
      }
    }
  }

  for (const block of body.root.children) {
    if (block.type === 'footnoteDefinition') {
      continue
    }
    if (block.type === 'solution') {
      scanNodes(block.children)
      continue
    }
    if (block.type === 'twoColumn') {
      scanNodes(block.children[0]!.children)
      scanNodes(block.children[1]!.children)
      continue
    }
    scanNodes([block])
  }
}

function collectReferencedFootnoteTargetKeys(body: LexicalBody): Set<string> {
  const keys = new Set<string>()
  walkMainColumnFootnoteRefs(body, (targetKey) => {
    keys.add(targetKey)
  })
  return keys
}

/** Definition `ptKey` values in **first citation order** (main column), then orphan defs in body order. */
function collectFootnoteCitationOrder(body: LexicalBody): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  walkMainColumnFootnoteRefs(body, (targetKey) => {
    if (seen.has(targetKey)) {
      return
    }
    seen.add(targetKey)
    order.push(targetKey)
  })
  for (const block of body.root.children) {
    if (block.type === 'footnoteDefinition' && block.ptKey !== undefined && !seen.has(block.ptKey)) {
      seen.add(block.ptKey)
      order.push(block.ptKey)
    }
  }
  return order
}

function mapSimpleInlineRefs(
  children: readonly LexicalSimpleInlineNode[],
  keyToIndex: Map<string, number>,
): LexicalSimpleInlineNode[] {
  const out: LexicalSimpleInlineNode[] = []
  for (const node of children) {
    if (node.type === 'footnoteRef') {
      const idx = keyToIndex.get(node.targetKey)
      if (idx !== undefined && idx !== node.index) {
        out.push({ ...node, index: idx })
        continue
      }
    }
    out.push(node)
  }
  return out
}

function mapInlineRefs(children: readonly LexicalInlineNode[], keyToIndex: Map<string, number>): LexicalInlineNode[] {
  const out: LexicalInlineNode[] = []
  for (const node of children) {
    if (node.type === 'footnoteRef') {
      const idx = keyToIndex.get(node.targetKey)
      if (idx !== undefined && idx !== node.index) {
        out.push({ ...node, index: idx })
        continue
      }
      out.push(node)
      continue
    }
    if (node.type === 'link') {
      out.push({ ...node, children: mapSimpleInlineRefs(node.children, keyToIndex) })
      continue
    }
    out.push(node)
  }
  return out
}

function mapBlocks(blocks: readonly LexicalNode[], keyToIndex: Map<string, number>): LexicalBlockNode[] {
  const out: LexicalBlockNode[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        out.push({ ...block, children: mapInlineRefs(block.children, keyToIndex) })
        break
      case 'quote':
        // Dialect-guaranteed paragraphs — the generic mapper cannot see
        // the narrowed type, so the rebuilt container is cast back (same
        // contract as `mapNestedBlocks`).
        out.push(unsafeCast<LexicalBlockNode>({ ...block, children: mapBlocks(block.children, keyToIndex) }))
        break
      case 'list':
      case 'listitem':
        out.push(unsafeCast<LexicalBlockNode>({ ...block, children: mapBlocks(block.children, keyToIndex) }))
        break
      case 'table':
        out.push({
          ...block,
          children: block.children.map((row) => ({
            ...row,
            children: row.children.map((cell) => ({
              ...cell,
              children: cell.children.map((paragraph) => ({
                ...paragraph,
                children: mapInlineRefs(paragraph.children, keyToIndex),
              })),
            })),
          })),
        })
        break
      case 'solution':
        out.push(unsafeCast<LexicalBlockNode>({ ...block, children: mapBlocks(block.children, keyToIndex) }))
        break
      case 'footnoteDefinition': {
        const idx = block.ptKey === undefined ? undefined : keyToIndex.get(block.ptKey)
        out.push(
          unsafeCast<LexicalBlockNode>({
            ...block,
            index: idx ?? block.index,
            children: mapBlocks(block.children, keyToIndex),
          }),
        )
        break
      }
      case 'twoColumn':
        out.push(
          unsafeCast<LexicalBlockNode>({
            ...block,
            children: block.children.map((pane) => ({ ...pane, children: mapBlocks(pane.children, keyToIndex) })),
          }),
        )
        break
      case 'code':
      case 'horizontalrule':
      case 'image':
      case 'mathBlock':
      case 'musicPlayer':
        out.push(block)
        break
      case 'link':
      case 'linebreak':
      case 'mathInline':
      case 'text':
      case 'footnoteRef':
      case 'twoColumnPane':
        // Unreachable in practice — mapBlocks is only called with
        // block-level positions (root / container / quote / list-item
        // children). A defensive throw keeps a future caller from
        // silently losing inline content.
        throw new Error(`footnote-sync: unexpected node type "${block.type}" in block position`)
    }
  }
  return out
}

/**
 * Renumber `footnoteDefinition.index` + `footnoteRef.index` by **first
 * citation order** in the main column (and solutions), then move every
 * definition to the end of the body sorted by index. Orphan defs
 * (never cited) are appended after the cited ones. Skips when there
 * are no defs or a ref targets a missing definition — the input is
 * returned unchanged (same reference) in those cases.
 */
export function synchronizeFootnoteIndicesLexical(body: LexicalBody): LexicalBody {
  const defKeys = new Set(
    body.root.children
      .filter((block): block is LexicalFootnoteDefinitionNode => block.type === 'footnoteDefinition')
      .map((block) => block.ptKey)
      .filter((key): key is string => key !== undefined),
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
  const keyToIndex = new Map(order.map((key, i) => [key, i + 1]))
  const synced = mapBlocks(body.root.children, keyToIndex)
  const definitions = synced.filter(
    (block): block is LexicalFootnoteDefinitionNode => block.type === 'footnoteDefinition',
  )
  const prose = synced.filter((block) => block.type !== 'footnoteDefinition')
  definitions.sort((a, b) => a.index - b.index)
  return { root: { ...body.root, children: [...prose, ...definitions] } }
}

// Re-exported for symmetry with the PT track; the signature feeds the
// editor-side dirty check (see `footnoteSyncSignature`).
export function footnoteSyncSignatureLexical(body: LexicalBody): string {
  const occurrences: string[] = []
  walkMainColumnFootnoteRefs(body, (targetKey, index) => {
    occurrences.push(`${targetKey}:${index}`)
  })
  const defs = body.root.children
    .filter((block): block is LexicalFootnoteDefinitionNode => block.type === 'footnoteDefinition')
    .map((block) => `${block.ptKey ?? ''}@${block.index}`)
    .sort()
  return `${occurrences.join('\u001f')}\u001e${defs.join('\u001f')}`
}
