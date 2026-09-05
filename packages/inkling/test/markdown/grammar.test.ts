import { createHeadlessEditor } from '@lexical/headless'
import { $convertFromMarkdownString } from '@lexical/markdown'
import { $getRoot, type TextFormatType } from 'lexical'

import { INLINE_DELIMITERS } from '@/markdown/grammar'
import { pasteDialect } from '@/markdown/paste-dialect'
import { MINIMAL_TRANSFORMERS } from '@/markdown/transformers-core'

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

      // markdown-it engine (paste dialect)
      const html = pasteDialect.render(input)
      expect(html).toContain(`<${PASTE_TAG_BY_FORMAT[format]}>marked</${PASTE_TAG_BY_FORMAT[format]}>`)

      // @lexical/markdown engine (round-trip dialect's inline set)
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
