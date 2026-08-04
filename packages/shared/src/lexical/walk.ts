import type {
  LexicalBlockNode,
  LexicalBody,
  LexicalHeadingNode,
  LexicalInlineNode,
  LexicalNode,
} from '@kobato/shared/lexical/schema'

import { Slugger } from '@kobato/shared/slug'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

// Pure-JSON traversal helpers for `LexicalBody` — the structural
// counterparts of `@kobato/shared/pt/utils`. Like the PT versions they
// are engine-free: everything here walks the plain EditorState JSON (no
// `lexical` runtime import), so the shared package stays dependency-free.
//
// Nesting is handled generically via the `children` arrays every element
// node carries (twoColumn panes included); the schema in `./schema` pins
// the depth rules, so a walk cannot recurse deeper than the dialect
// allows.

// --- traversal -------------------------------------------------------------

export interface LexicalVisitContext {
  /** The node's parent (null only for root-level blocks). */
  parent: LexicalNode | null
  /** Index of the node within its parent's `children` array. */
  index: number
  /** 1 for root-level blocks, +1 per nesting level. */
  depth: number
}

function childrenOf(node: LexicalNode): LexicalNode[] | undefined {
  const children = unsafeCast<{ children?: unknown }>(node).children
  return Array.isArray(children) ? unsafeCast<LexicalNode[]>(children) : undefined
}

/**
 * Depth-first walk over a `LexicalBody` in render order (pre-order:
 * container first, then its descendants). The root container itself is
 * not visited — its children are, at depth 1. `visit` receives every
 * node with its parent / index / depth, so collectors can filter by
 * `type` and keep position context (the footnote sync uses the context
 * to tell main-column refs from definition-nested refs).
 */
export function visitLexicalNodes(
  body: LexicalBody,
  visit: (node: LexicalNode, ctx: LexicalVisitContext) => void,
): void {
  function walkChildren(children: LexicalNode[], parent: LexicalNode | null, depth: number): void {
    for (let i = 0; i < children.length; i += 1) {
      const node = children[i]!
      visit(node, { parent, index: i, depth })
      const childrenList = childrenOf(node)
      if (childrenList !== undefined) {
        walkChildren(childrenList, node, depth + 1)
      }
    }
  }
  walkChildren(body.root.children, null, 1)
}

/**
 * Mapping counterpart of `visitLexicalNodes` — same pre-order, same
 * nesting rules. Every node is mapped exactly once; the result is always
 * a new body with new container objects, while untouched leaves keep
 * their identity. The callback MAY change a node's type and fields (it
 * is a plain JSON transform), but a mapped node that still carries a
 * `children` array gets its children mapped recursively.
 */
export function mapLexicalNodes(body: LexicalBody, map: (node: LexicalNode) => LexicalNode): LexicalBody {
  function mapChildren(children: LexicalNode[]): LexicalNode[] {
    return children.map((child) => {
      const mapped = map(child)
      const childList = childrenOf(mapped)
      if (childList === undefined) {
        return mapped
      }
      // The generic mapper cannot preserve per-type children unions
      // (e.g. `footnoteDefinition.children` is `NonContainerBlock[]`),
      // so the rebuilt container is cast back — same contract as the PT
      // `mapNestedBlocks` (`unsafeCast` at the container sites).
      return unsafeCast<LexicalNode>({ ...mapped, children: mapChildren(childList) })
    })
  }
  return { root: { ...body.root, children: unsafeCast<LexicalBlockNode[]>(mapChildren(body.root.children)) } }
}

// --- collectors ------------------------------------------------------------

/** Walk a body and pick out every `image.storagePath` referenced, deduped in first-seen order. */
export function collectImageStoragePaths(body: LexicalBody): string[] {
  const paths = new Set<string>()
  visitLexicalNodes(body, (node) => {
    if (node.type === 'image' && typeof node.storagePath === 'string' && node.storagePath !== '') {
      paths.add(node.storagePath)
    }
  })
  return Array.from(paths)
}

/** Walk a body and pick out every `musicPlayer.playerId` referenced, deduped in first-seen order. */
export function collectMusicPlayerIds(body: LexicalBody): string[] {
  const ids = new Set<string>()
  visitLexicalNodes(body, (node) => {
    if (node.type === 'musicPlayer') {
      ids.add(node.playerId)
    }
  })
  return Array.from(ids)
}

// --- plain text ------------------------------------------------------------

/**
 * Plain-text projection used by search / RSS summary / OG fallback —
 * mirrors `bodyToPlainText` (`@kobato/shared/pt/utils`):
 *
 *   - one line per paragraph-like block: text nodes joined with their
 *     sibling `linebreak`s as literal `\n`, `footnoteRef` contributing
 *     its display digit (the PT span text the digit came from), links
 *     recursed
 *   - `code` pushes its text nodes joined (embedded `\n` preserved)
 *   - `mathBlock` pushes `tex`; `image` pushes `alt`; `musicPlayer`
 *     pushes `[Music: <playerId>]`; `horizontalrule` pushes `---`
 *   - a `table` pushes one string of all cell text (matching the PT
 *     per-table projection)
 *   - containers (`list` / `listitem` / `quote` / `solution` /
 *     `twoColumn` / `footnoteDefinition`) recurse; lines join on `\n`,
 *     then trim.
 */
export function bodyToPlainText(body: LexicalBody): string {
  const out: string[] = []
  for (const block of body.root.children) {
    pushBlockText(block, out)
  }
  return out.join('\n').trim()
}

function pushBlockText(node: LexicalNode, out: string[]): void {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      out.push(inlineText(node.children))
      return
    case 'quote':
    case 'list':
    case 'listitem':
    case 'solution':
    case 'twoColumn':
    case 'twoColumnPane':
    case 'footnoteDefinition':
      for (const child of node.children) {
        pushBlockText(child, out)
      }
      return
    case 'code':
      out.push(node.children.map((child) => child.text).join(''))
      return
    case 'mathBlock':
      out.push(node.tex)
      return
    case 'image':
      if (node.alt !== undefined && node.alt !== '') {
        out.push(node.alt)
      }
      return
    case 'table': {
      const cells: string[] = []
      for (const row of node.children) {
        for (const cell of row.children) {
          for (const paragraph of cell.children) {
            cells.push(inlineText(paragraph.children))
          }
        }
      }
      out.push(cells.join(''))
      return
    }
    case 'horizontalrule':
      out.push('---')
      return
    case 'musicPlayer':
      out.push(`[Music: ${node.playerId}]`)
      return
    case 'text':
    case 'linebreak':
    case 'link':
    case 'footnoteRef':
    case 'mathInline':
      // Inline node types never appear as block children in the
      // canonicalized dialect — the block projection skips them.
      return
  }
}

/** Inline projection: text + `\n` for linebreaks, link children recursed, mathInline silent, footnoteRef as its digit. */
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
        // The PT span text behind mathInline is empty; contribute nothing.
        break
    }
  }
  return out
}

// --- heading slots ---------------------------------------------------------

export interface LexicalHeadingSlot {
  /**
   * Originating PT block `_key` when the heading still carries a `ptKey`
   * (custom-node-only field — standard `heading` nodes never do, so this
   * is `''` for canonical content; R2 renderers key slots by position).
   */
  blockKey: string
  plainText: string
  depth: number
}

function tryPushHeadingSlot(node: LexicalNode, out: LexicalHeadingSlot[]): void {
  if (node.type !== 'heading') {
    return
  }
  const plainText = inlineText(node.children).trim()
  if (plainText.length === 0) {
    return
  }
  const depth = Number(node.tag.slice(1))
  // Standard `heading` nodes carry no `ptKey` in the dialect, but the
  // accessor tolerates a pre-canonical node that still has one.
  const blockKey = unsafeCast<LexicalHeadingNode & { ptKey?: string }>(node).ptKey ?? ''
  out.push({ blockKey, plainText, depth })
}

function visitBlockListForHeadings(blocks: readonly LexicalBlockNode[], out: LexicalHeadingSlot[]): void {
  for (const block of blocks) {
    tryPushHeadingSlot(block, out)
  }
}

/**
 * Heading blocks in **exact** render order for the future Lexical renderer:
 * top-level main column (skipping `footnoteDefinition` rows), DFS into
 * each `solution` and each `twoColumn` (left pane then right pane), then
 * every footnote definition's children in row order. Ported from
 * `collectHeadingSlotsInPortableTextRenderOrder`
 * (`@kobato/shared/pt/utils`) so `_key`-less heading anchors can stay
 * stable across SSR and hydration without render-phase state.
 */
export function collectHeadingSlotsInLexicalRenderOrder(body: LexicalBody): LexicalHeadingSlot[] {
  const out: LexicalHeadingSlot[] = []
  for (const block of body.root.children) {
    if (block.type === 'footnoteDefinition') {
      continue
    }
    if (block.type === 'solution') {
      visitBlockListForHeadings(block.children, out)
      continue
    }
    if (block.type === 'twoColumn') {
      visitBlockListForHeadings(block.children[0]!.children, out)
      visitBlockListForHeadings(block.children[1]!.children, out)
      continue
    }
    // Every other block type is a heading candidate (or empty text).
    tryPushHeadingSlot(block, out)
  }
  for (const block of body.root.children) {
    if (block.type === 'footnoteDefinition') {
      visitBlockListForHeadings(block.children, out)
    }
  }
  return out
}

// --- structured headings (TOC) ----------------------------------------------

/**
 * Return the structured TOC entries this body would render — the Lexical
 * counterpart of `collectHeadings` (`@kobato/shared/pt/utils`), with the
 * same slug pipeline (`transform` → `Slugger`; server-side callers pass
 * `deriveSlug` from `@kobato/server/infra/slug/derive` to romanise CJK via
 * `pinyin-pro` — it can't be imported here because this module ships to
 * the client). Order matches
 * `collectHeadingSlotsInLexicalRenderOrder` so callers can pass
 * `headings.map((h) => h.slug)` to the renderers.
 */
export function collectHeadingsLexical(
  body: LexicalBody,
  transform: (text: string) => string = (text) => text,
): { depth: number; text: string; slug: string }[] {
  const slugger = new Slugger()
  const slots = collectHeadingSlotsInLexicalRenderOrder(body)
  return slots.map(({ depth, plainText }) => ({
    depth,
    text: plainText,
    slug: slugger.slug(transform(plainText)),
  }))
}
