import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { MarkdownHeading } from '@/shared/utils/toc'

import { createHeadingSlugTracker, slugifyHeadingText } from '@/shared/lexical/heading-slug'
import { lexicalNodeTextContent, visitLexicalNodes } from '@/shared/lexical/walk'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Save-time derived columns for the Lexical storage format (plan
// docs/plans/inkling-editor-replacement.md, round R9a) — the Lexical
// counterparts of `collectHeadings` / `collectImageStoragePaths` /
// `collectMusicPlayerIds` in `@/shared/pt/utils`.

/**
 * TOC entries in document order. The slug policy is inkling's own
 * (`@/shared/lexical/heading-slug`) so the column matches the ids inkling's
 * HTML export stamps on `<hN>` tags byte-for-byte — including the `-N`
 * duplicate suffix. EVERY heading feeds the tracker (even empty-text ones)
 * because the export pass dedups over every heading it renders; entries
 * with empty trimmed text are then dropped from the column (PT parity:
 * they produce no usable TOC row).
 *
 * Host cards (solution / two-column) carry their content in opaque
 * datasets, not `children` — headings inside them are out of scope until
 * R10 defines those datasets.
 */
export function collectLexicalHeadings(state: LexicalEditorState): MarkdownHeading[] {
  const track = createHeadingSlugTracker()
  const out: MarkdownHeading[] = []
  visitLexicalNodes(state, (node) => {
    if (node.type !== 'extended-heading') {
      return
    }
    // Per-variant fields the shared node type does not model; the schema
    // pins `tag` on extended-heading, `storagePath` on image (optional), and
    // `playerId` on music-player.
    const tag = unsafeCast<{ tag?: unknown }>(node).tag
    const depth = typeof tag === 'string' && tag.length === 2 ? Number(tag[1]) : Number.NaN
    const rawText = lexicalNodeTextContent(node)
    const slug = track(slugifyHeadingText(rawText))
    const text = rawText.trim()
    if (!Number.isInteger(depth) || depth < 1 || depth > 6 || text.length === 0) {
      return
    }
    out.push({ depth, text, slug })
  })
  return out
}

/** Deduped image storage paths in first-seen order (PT parity). */
export function collectLexicalImageStoragePaths(state: LexicalEditorState): string[] {
  const paths = new Set<string>()
  visitLexicalNodes(state, (node) => {
    if (node.type !== 'image') {
      return
    }
    const storagePath = unsafeCast<{ storagePath?: unknown }>(node).storagePath
    if (typeof storagePath === 'string' && storagePath !== '') {
      paths.add(storagePath)
    }
  })
  return Array.from(paths)
}

/** Deduped music player ids in first-seen order (PT parity). */
export function collectLexicalMusicPlayerIds(state: LexicalEditorState): string[] {
  const ids = new Set<string>()
  visitLexicalNodes(state, (node) => {
    if (node.type !== 'music-player') {
      return
    }
    const playerId = unsafeCast<{ playerId?: unknown }>(node).playerId
    if (typeof playerId === 'string' && playerId !== '') {
      ids.add(playerId)
    }
  })
  return Array.from(ids)
}
