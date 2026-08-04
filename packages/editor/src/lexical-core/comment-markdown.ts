import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'

import { createCommentEditorConfig } from '@kobato/editor/lexical-core/create-comment-editor-config'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { createHeadlessEditor } from '@lexical/headless'
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown'

// Serialise a canonical Lexical comment body back into markdown — the
// Lexical replacement of `commentBodyToMarkdown`
// (`@kobato/shared/pt/comment-markdown`). The output is stored in
// `comment.content` as a rollback snapshot: every save writes BOTH the
// Lexical `body` (canonical) and this markdown projection.
//
// The export runs through @lexical/markdown's `$convertToMarkdownString`
// on a headless comment-registry editor. Two dialect notes:
//
//   - `mathInline` is a decorator node with no markdown exporter, so it
//     is rewritten into a text node carrying the legacy `$tex$` form
//     (the PT snapshot rendered the same `$…$` glyph) BEFORE the parse —
//     the markdown text then carries the math source.
//   - `underline` (format bit 8) has no markdown transformer in 0.45 —
//     it exports as plain text (a documented, accepted divergence from
//     the PT snapshot's `<u>…</u>`).
//
// The headless editor is a module-level lazy singleton.

let headlessEditor: ReturnType<typeof createHeadlessEditor> | undefined

function getHeadlessEditor(): ReturnType<typeof createHeadlessEditor> {
  if (headlessEditor === undefined) {
    headlessEditor = createHeadlessEditor(createCommentEditorConfig())
  }
  return headlessEditor
}

interface MutableTextLike {
  detail: number
  format: number
  mode: string
  style: string
  text: string
  type: string
  version: number
}

/** Rewrite `mathInline` decorator nodes into `$tex$` text nodes (depth-first). */
function inlineMathToText(node: unknown): unknown {
  if (typeof node !== 'object' || node === null) {
    return node
  }
  const record = unsafeCast<Record<string, unknown>>(node)
  if (Array.isArray(record.children)) {
    record.children = record.children.map(inlineMathToText)
  }
  if (record.type === 'mathInline') {
    const tex = typeof record.tex === 'string' ? record.tex : ''
    return {
      detail: 0,
      format: 0,
      mode: 'normal',
      style: '',
      text: `$${tex}$`,
      type: 'text',
      version: 1,
    } satisfies MutableTextLike
  }
  return record
}

/**
 * Markdown rollback snapshot for a canonical comment body.
 */
export function commentBodyToMarkdown(body: LexicalCommentBody): string {
  const json = JSON.stringify({ root: inlineMathToText(structuredClone(body.root)) })
  const state = getHeadlessEditor().parseEditorState(json)
  let markdown = ''
  state.read(() => {
    markdown = $convertToMarkdownString(TRANSFORMERS, undefined, false)
  })
  return markdown.trim()
}
