import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { MarkdownHeading } from '@/shared/utils/toc'

import { createHeadingSlugTracker, slugifyHeadingText } from '@/shared/lexical/heading-slug'
import { lexicalNodeTextContent, visitLexicalNodes } from '@/shared/lexical/walk'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Save-time derived columns for the Lexical storage format.

/**
 * TOC entries in document order. The slug policy is inkling's own
 * (`@/shared/lexical/heading-slug`) so the column matches the ids the HTML
 * export stamps byte-for-byte, including the `-N` duplicate suffix. EVERY
 * heading feeds the tracker (even empty-text ones — the export dedups over
 * every heading it renders); empty-text entries are then dropped, producing no
 * TOC row. Host cards carry content in opaque datasets, not `children`, so
 * headings inside them are not collected.
 */
export function collectLexicalHeadings(state: LexicalEditorState): MarkdownHeading[] {
  const track = createHeadingSlugTracker()
  const out: MarkdownHeading[] = []
  visitLexicalNodes(state, (node) => {
    if (node.type !== 'extended-heading') {
      return
    }
    // `tag` is a per-variant field the shared node type does not model; the
    // schema pins it on extended-heading.
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

/** Deduped image storage paths in first-seen order. */
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

/** Deduped music player ids in first-seen order. */
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
