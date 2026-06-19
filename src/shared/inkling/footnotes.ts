import type {
  InklingBlockNode,
  InklingDocument,
  InklingFootnoteDefinitionNode,
  InklingInlineNode,
  InklingListItemNode,
  InklingListNode,
  InklingNonRecursiveBlockNode,
  InklingTableCellNode,
} from '@/shared/inkling/schema'

export interface InklingFootnoteRefEntry {
  /** Definition key this reference points to. */
  targetKey: string
  /** Unique key of the reference node itself. */
  refKey: string
  /** Display index at the time of collection (may be stale). */
  index: number
}

export interface InklingFootnoteDefinitionEntry {
  /** Definition key — same as the targetKey refs point to. */
  targetKey: string
  /** Display index at the time of collection (may be stale). */
  index: number
  children: InklingNonRecursiveBlockNode[]
}

// --- Reference collection ----------------------------------------------------

function collectInlineFootnoteRefs(nodes: readonly InklingInlineNode[], out: InklingFootnoteRefEntry[]): void {
  for (const node of nodes) {
    if (node.type === 'footnote-ref') {
      out.push({ targetKey: node.targetKey, refKey: node.refKey, index: node.index })
    } else if (node.type === 'link') {
      collectInlineFootnoteRefs(node.children, out)
    }
  }
}

function collectListItemFootnoteRefs(item: InklingListItemNode, out: InklingFootnoteRefEntry[]): void {
  for (const child of item.children) {
    if (child.type === 'list') {
      collectListFootnoteRefs(child, out)
    } else {
      collectInlineFootnoteRefs([child], out)
    }
  }
}

function collectListFootnoteRefs(node: InklingListNode, out: InklingFootnoteRefEntry[]): void {
  for (const item of node.children) {
    collectListItemFootnoteRefs(item, out)
  }
}

function collectTableFootnoteRefs(
  node: { rows: readonly { cells: readonly InklingTableCellNode[] }[] },
  out: InklingFootnoteRefEntry[],
): void {
  for (const row of node.rows) {
    for (const cell of row.cells) {
      collectInlineFootnoteRefs(cell.children, out)
    }
  }
}

function collectNonRecursiveBlockFootnoteRefs(
  block: InklingNonRecursiveBlockNode,
  out: InklingFootnoteRefEntry[],
): void {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'quote': {
      collectInlineFootnoteRefs(block.children, out)
      return
    }
    case 'list': {
      collectListFootnoteRefs(block, out)
      return
    }
    case 'table': {
      collectTableFootnoteRefs(block, out)
      return
    }
    case 'image-card':
    case 'code-block':
    case 'math-block':
    case 'music-card':
    case 'horizontal-rule': {
      return
    }
  }
}

/**
 * Collect every `footnote-ref` inline node that appears in the main document
 * flow, in document order. The scan recurses into `solution` and `two-column`
 * containers but not into `footnote-definition` bodies, matching the PT bridge
 * semantics where references live in the prose and definitions live in parallel
 * state.
 */
export function collectFootnoteRefs(document: InklingDocument): InklingFootnoteRefEntry[] {
  const refs: InklingFootnoteRefEntry[] = []

  function visitBlock(block: InklingBlockNode): void {
    if (block.type === 'solution') {
      for (const child of block.children) {
        collectNonRecursiveBlockFootnoteRefs(child, refs)
      }
      return
    }
    if (block.type === 'two-column') {
      for (const child of block.left) {
        collectNonRecursiveBlockFootnoteRefs(child, refs)
      }
      for (const child of block.right) {
        collectNonRecursiveBlockFootnoteRefs(child, refs)
      }
      return
    }
    if (block.type === 'footnote-definition') {
      // Definitions are parallel state, not part of the citation order.
      return
    }
    collectNonRecursiveBlockFootnoteRefs(block, refs)
  }

  for (const block of document.root.children) {
    visitBlock(block)
  }

  return refs
}

// --- Definition collection ---------------------------------------------------

/**
 * Collect every `footnote-definition` node from the document root, preserving
 * root order.
 */
export function collectFootnoteDefinitions(document: InklingDocument): InklingFootnoteDefinitionEntry[] {
  const defs: InklingFootnoteDefinitionEntry[] = []
  for (const block of document.root.children) {
    if (block.type === 'footnote-definition') {
      defs.push({ targetKey: block.targetKey, index: block.index, children: block.children })
    }
  }
  return defs
}

// --- Synchronization ---------------------------------------------------------

function buildDefinitionMap(
  defs: readonly InklingFootnoteDefinitionEntry[],
): Map<string, InklingFootnoteDefinitionEntry> {
  const map = new Map<string, InklingFootnoteDefinitionEntry>()
  for (const def of defs) {
    map.set(def.targetKey, def)
  }
  return map
}

function orderDefinitionsByFirstRef(
  refs: readonly InklingFootnoteRefEntry[],
  defMap: Map<string, InklingFootnoteDefinitionEntry>,
): string[] {
  const order: string[] = []
  const seen = new Set<string>()

  for (const ref of refs) {
    if (seen.has(ref.targetKey)) {
      continue
    }
    if (!defMap.has(ref.targetKey)) {
      continue
    }
    seen.add(ref.targetKey)
    order.push(ref.targetKey)
  }

  // Append orphan definitions at the end to preserve their content.
  for (const def of defMap.values()) {
    if (!seen.has(def.targetKey)) {
      seen.add(def.targetKey)
      order.push(def.targetKey)
    }
  }

  return order
}

function updateInlineFootnoteIndex(
  nodes: readonly InklingInlineNode[],
  keyToIndex: Map<string, number>,
): InklingInlineNode[] {
  return nodes.map((node) => {
    if (node.type === 'footnote-ref') {
      const index = keyToIndex.get(node.targetKey)
      if (index === undefined || index === node.index) {
        return node
      }
      return { ...node, index }
    }
    if (node.type === 'link') {
      return { ...node, children: updateInlineFootnoteIndex(node.children, keyToIndex) }
    }
    return node
  })
}

function updateListItemFootnoteIndex(item: InklingListItemNode, keyToIndex: Map<string, number>): InklingListItemNode {
  return {
    ...item,
    children: item.children.map((child) => {
      if (child.type === 'list') {
        return updateListFootnoteIndex(child, keyToIndex)
      }
      return updateInlineFootnoteIndex([child], keyToIndex)[0]!
    }),
  }
}

function updateListFootnoteIndex(node: InklingListNode, keyToIndex: Map<string, number>): InklingListNode {
  return {
    ...node,
    children: node.children.map((item) => updateListItemFootnoteIndex(item, keyToIndex)),
  }
}

function updateTableFootnoteIndex(
  node: { rows: readonly { cells: readonly InklingTableCellNode[] }[] },
  keyToIndex: Map<string, number>,
): InklingTableCellNode[][] {
  return node.rows.map((row) =>
    row.cells.map((cell) => ({
      ...cell,
      children: updateInlineFootnoteIndex(cell.children, keyToIndex),
    })),
  )
}

function updateNonRecursiveBlockFootnoteIndex(
  block: InklingNonRecursiveBlockNode,
  keyToIndex: Map<string, number>,
): InklingNonRecursiveBlockNode {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'quote': {
      return { ...block, children: updateInlineFootnoteIndex(block.children, keyToIndex) }
    }
    case 'list': {
      return updateListFootnoteIndex(block, keyToIndex)
    }
    case 'table': {
      return {
        ...block,
        rows: block.rows.map((row, rowIndex) => ({
          ...row,
          cells: updateTableFootnoteIndex({ rows: [block.rows[rowIndex]!] }, keyToIndex)[0]!,
        })),
      }
    }
    case 'image-card':
    case 'code-block':
    case 'math-block':
    case 'music-card':
    case 'horizontal-rule': {
      return block
    }
  }
}

function updateBlockFootnoteIndex(block: InklingBlockNode, keyToIndex: Map<string, number>): InklingBlockNode {
  if (block.type === 'solution') {
    return {
      ...block,
      children: block.children.map((child) => updateNonRecursiveBlockFootnoteIndex(child, keyToIndex)),
    }
  }
  if (block.type === 'two-column') {
    return {
      ...block,
      left: block.left.map((child) => updateNonRecursiveBlockFootnoteIndex(child, keyToIndex)),
      right: block.right.map((child) => updateNonRecursiveBlockFootnoteIndex(child, keyToIndex)),
    }
  }
  if (block.type === 'footnote-definition') {
    const index = keyToIndex.get(block.targetKey)
    return {
      ...block,
      index: index ?? block.index,
      children: block.children.map((child) => updateNonRecursiveBlockFootnoteIndex(child, keyToIndex)),
    }
  }
  return updateNonRecursiveBlockFootnoteIndex(block, keyToIndex)
}

export interface InklingFootnoteSyncResult {
  document: InklingDocument
  /** Keys of definitions that are referenced but missing. */
  missing: string[]
  /** Keys of definitions that have no references. */
  orphans: string[]
}

/**
 * Synchronize `index` fields on every `footnote-ref` and `footnote-definition`
 * so that display numbers follow the first-reference order in the main
 * document flow. Orphan definitions keep their relative order at the end.
 * Missing definitions are reported but left untouched so the caller can decide
 * whether to repair or reject the document.
 */
export function synchronizeInklingFootnoteIndices(document: InklingDocument): InklingFootnoteSyncResult {
  const refs = collectFootnoteRefs(document)
  const defs = collectFootnoteDefinitions(document)
  const defMap = buildDefinitionMap(defs)

  const referencedTargetKeys = new Set(refs.map((r) => r.targetKey))
  const missing: string[] = []
  for (const targetKey of referencedTargetKeys) {
    if (!defMap.has(targetKey)) {
      missing.push(targetKey)
    }
  }

  const orphans = defs.filter((d) => !referencedTargetKeys.has(d.targetKey)).map((d) => d.targetKey)
  const order = orderDefinitionsByFirstRef(refs, defMap)

  if (order.length === 0) {
    return { document, missing, orphans }
  }

  const keyToIndex = new Map(order.map((targetKey, i) => [targetKey, i + 1]))
  const updatedRootChildren = document.root.children.map((block) => updateBlockFootnoteIndex(block, keyToIndex))

  const prose = updatedRootChildren.filter(
    (b): b is Exclude<InklingBlockNode, InklingFootnoteDefinitionNode> => b.type !== 'footnote-definition',
  )
  const syncedDefs = updatedRootChildren
    .filter((b): b is InklingFootnoteDefinitionNode => b.type === 'footnote-definition')
    .sort((a, b) => a.index - b.index)

  return {
    document: {
      ...document,
      root: {
        ...document.root,
        children: [...prose, ...syncedDefs],
      },
    },
    missing,
    orphans,
  }
}

// --- Orphan removal ----------------------------------------------------------

/**
 * Return a new document with orphan `footnote-definition` nodes removed.
 * A definition is orphan when no `footnote-ref` in the main document flow
 * points to it.
 */
export function removeOrphanFootnoteDefinitions(document: InklingDocument): InklingDocument {
  const refs = collectFootnoteRefs(document)
  const referenced = new Set(refs.map((r) => r.targetKey))
  return {
    ...document,
    root: {
      ...document.root,
      children: document.root.children.filter((block) => {
        if (block.type !== 'footnote-definition') {
          return true
        }
        return referenced.has(block.targetKey)
      }),
    },
  }
}

// --- Missing definition detection --------------------------------------------

/**
 * Return the set of `targetKey` values referenced by `footnote-ref` nodes that
 * have no matching `footnote-definition` in the document.
 */
export function findMissingFootnoteDefinitions(document: InklingDocument): string[] {
  const refs = collectFootnoteRefs(document)
  const defs = collectFootnoteDefinitions(document)
  const defKeys = new Set(defs.map((d) => d.targetKey))
  const missing = new Set<string>()
  for (const ref of refs) {
    if (!defKeys.has(ref.targetKey)) {
      missing.add(ref.targetKey)
    }
  }
  return Array.from(missing)
}

// --- Footnote section plain text ---------------------------------------------

interface PlainTextCtx {
  out: string[]
  blockStarted: boolean
}

function pushPlainText(ctx: PlainTextCtx, text: string): void {
  ctx.out.push(text)
  ctx.blockStarted = true
}

function endPlainTextBlock(ctx: PlainTextCtx): void {
  if (ctx.blockStarted) {
    ctx.out.push('\n')
    ctx.blockStarted = false
  }
}

function inlineNodesToPlainTextContext(nodes: readonly InklingInlineNode[], ctx: PlainTextCtx): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'text': {
        pushPlainText(ctx, node.text)
        break
      }
      case 'linebreak': {
        pushPlainText(ctx, '\n')
        break
      }
      case 'inline-math': {
        pushPlainText(ctx, node.tex)
        break
      }
      case 'footnote-ref': {
        pushPlainText(ctx, String(node.index))
        break
      }
      case 'link': {
        inlineNodesToPlainTextContext(node.children, ctx)
        break
      }
    }
  }
}

function nonRecursiveBlocksToPlainText(blocks: readonly InklingNonRecursiveBlockNode[]): string {
  const ctx: PlainTextCtx = { out: [], blockStarted: false }
  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
      case 'quote': {
        inlineNodesToPlainTextContext(block.children, ctx)
        endPlainTextBlock(ctx)
        break
      }
      case 'list': {
        for (const item of block.children) {
          inlineNodesToPlainTextContext(
            item.children.filter((c): c is Exclude<typeof c, InklingListNode> => c.type !== 'list'),
            ctx,
          )
          endPlainTextBlock(ctx)
        }
        break
      }
      case 'table': {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            inlineNodesToPlainTextContext(cell.children, ctx)
            endPlainTextBlock(ctx)
          }
        }
        break
      }
      case 'code-block': {
        pushPlainText(ctx, block.code)
        endPlainTextBlock(ctx)
        break
      }
      case 'math-block': {
        pushPlainText(ctx, block.tex)
        endPlainTextBlock(ctx)
        break
      }
      case 'image-card': {
        if (block.alt !== undefined && block.alt !== '') {
          pushPlainText(ctx, block.alt)
          endPlainTextBlock(ctx)
        }
        break
      }
      case 'music-card': {
        pushPlainText(ctx, `[Music: ${block.playerId}]`)
        endPlainTextBlock(ctx)
        break
      }
      case 'horizontal-rule': {
        pushPlainText(ctx, '---')
        endPlainTextBlock(ctx)
        break
      }
    }
  }
  return ctx.out.join('').trim()
}

/**
 * Render the footnote definition section as plain text, using the same ordering
 * as `synchronizeInklingFootnoteIndices`. This is the Inkling equivalent of the
 * old PT footnote section used by the migration verifier.
 */
export function inklingFootnoteSectionToPlainText(document: InklingDocument): string {
  const defs = collectFootnoteDefinitions(document).sort((a, b) => a.index - b.index)
  const lines: string[] = []
  for (const def of defs) {
    const text = nonRecursiveBlocksToPlainText(def.children)
    if (text.length > 0) {
      lines.push(text)
    }
  }
  return lines.join('\n').trim()
}
