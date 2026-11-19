import { INLINE_DELIMITERS } from '@kobato/inkling-internal/markdown/grammar'
import { pasteDialect } from '@kobato/inkling-internal/markdown/paste-dialect'
import { MINIMAL_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers-core'
import { createHeadlessEditor } from '@lexical/headless'
import { $convertFromMarkdownString } from '@lexical/markdown'
import { $getRoot, type TextFormatType } from 'lexical'
import { describe, expect, it } from 'vitest'

// The shared grammar table's projection pin: every inline delimiter the
// table declares must be honored by BOTH markdown engines — the paste
// dialect's markdown-it stack (HTML out) and the round-trip dialect's
// `@lexical/markdown` transformer set (Lexical format out). A table edit
// that outruns either engine fails here instead of drifting silently.

const PASTE_TAG_BY_FORMAT: Record<(typeof INLINE_DELIMITERS)[number]['format'], string> = {
  highlight: 'mark',
  subscript: 'sub',
  superscript: 'sup',
}

describe('shared markdown grammar table', () => {
  INLINE_DELIMITERS.forEach(({ format, tag }) => {
    it(`${tag}…${tag} is honored by both engines as ${format}`, () => {
      const input = `${tag}marked${tag}`

      const html = pasteDialect.render(input)
      expect(html).toContain(`<${PASTE_TAG_BY_FORMAT[format]}>marked</${PASTE_TAG_BY_FORMAT[format]}>`)

      const editor = createHeadlessEditor({
        namespace: 'test',
        nodes: [],
        onError: (error) => {
          throw error
        },
      })
      editor.update(
        () => {
          $convertFromMarkdownString(input, MINIMAL_TRANSFORMERS)
        },
        { discrete: true },
      )
      editor.getEditorState().read(() => {
        const textNode = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === 'marked')
        expect(textNode?.hasFormat(format as TextFormatType)).toBe(true)
      })
    })
  })
})
