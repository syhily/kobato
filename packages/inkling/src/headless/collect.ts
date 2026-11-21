import type { LexicalEditorState } from '@kobato/inkling-internal/headless/schema'
import type { MarkdownHeading } from '@kobato/inkling-internal/headless/toc'

import { lexicalNodeTextContent, visitLexicalNodes } from '@kobato/inkling-internal/headless/walk'
import { createHeadingIdTracker as createHeadingSlugTracker } from '@kobato/inkling-internal/utils/heading-id-tracker'
import { slugify as slugifyHeadingText } from '@kobato/inkling-internal/utils/slugify'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export function collectLexicalHeadings(state: LexicalEditorState): MarkdownHeading[] {
  const track = createHeadingSlugTracker()
  const out: MarkdownHeading[] = []
  visitLexicalNodes(state, (node) => {
    if (node.type !== 'extended-heading') {
      return
    }
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
