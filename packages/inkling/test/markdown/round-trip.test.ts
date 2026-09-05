import { IS_HIGHLIGHT, IS_SUBSCRIPT, IS_SUPERSCRIPT, type SerializedEditorState } from 'lexical'
import { describe, it } from 'vitest'

import type { SerializedCodeBlockNode } from '@/nodes/CodeBlockNode'

import { lexicalStateToMarkdown, markdownToLexicalState } from '@/markdown/round-trip'

describe('Markdown round-trip', function () {
  function roundTrip(markdown: string) {
    const state = markdownToLexicalState(markdown)
    return lexicalStateToMarkdown(state)
  }

  it('round-trips a heading', function () {
    const markdown = '# Hello\n\nworld'
    expect(roundTrip(markdown)).toBe('# Hello\n\nworld')
  })

  it('round-trips bold and italic text', function () {
    const markdown = '**bold** and *italic*'
    expect(roundTrip(markdown)).toBe('**bold** and *italic*')
  })

  it('round-trips a link', function () {
    const markdown = '[Inkling](https://example.com)'
    expect(roundTrip(markdown)).toBe('[Inkling](https://example.com)')
  })

  it('round-trips a list', function () {
    const markdown = '- one\n- two\n- three'
    expect(roundTrip(markdown)).toBe('- one\n- two\n- three')
  })

  it('round-trips a numbered list', function () {
    const markdown = '1. one\n2. two\n3. three'
    expect(roundTrip(markdown)).toBe('1. one\n2. two\n3. three')
  })

  it('round-trips a code block', function () {
    const markdown = '```js\nconst x = 1\n```'
    const state = markdownToLexicalState(markdown)
    // the dialect's own CODE_FENCE transformer claims the fence on import —
    // no more literal paragraphs that export re-escapes to \`\`\`
    expect((state.root.children[0] as SerializedCodeBlockNode).type).toBe('codeblock')
    expect(lexicalStateToMarkdown(state)).toBe(markdown)
  })

  it('round-trips a code block without a language', function () {
    const markdown = '```\nplain code\n```'
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('round-trips a code block with a non-word language name', function () {
    // the export side emits free-input languages verbatim, so the import side
    // accepts more than \w — c++/shell-session used to import as literal
    // paragraphs
    const markdown = '```c++\nint main() {}\n```'
    const state = markdownToLexicalState(markdown)
    expect((state.root.children[0] as SerializedCodeBlockNode).type).toBe('codeblock')
    expect((state.root.children[0] as SerializedCodeBlockNode).language).toBe('c++')
    expect(lexicalStateToMarkdown(state)).toBe(markdown)
  })

  it('round-trips a horizontal rule', function () {
    const markdown = '---'
    expect(roundTrip(markdown)).toBe('---')
  })

  // Markdown cards round-trip via the `inkling:markdown` fence, whose body is
  // the card's raw markdown content (see `round-trip-cards.test.ts` for the
  // full field-level coverage).
  it('round-trips a markdown card', function () {
    const markdown = '```inkling:markdown\nSome **bold** text\n```'
    expect(roundTrip(markdown).trim()).toBe(markdown)
  })

  // The card-aware round-trip dialect's coverage vs the paste dialect (plan
  // 050 pins). Card-fence import itself is pinned in
  // round-trip-cards.test.ts (```inkling:bookmark``` → BookmarkNode) and not
  // re-pinned here.
  function firstTextOf(state: SerializedEditorState) {
    const paragraph = state.root.children[0] as unknown as { children: Array<{ text: string; format: number }> }
    return paragraph.children[0]
  }

  it('imports ==marked== as highlight-formatted text', function () {
    // @lexical/markdown's TEXT_FORMAT_TRANSFORMERS include HIGHLIGHT, so this
    // dialect speaks ==mark== as well — same result as the paste dialect's
    // <mark> import (pinned in test/unit/plugins/MarkdownPastePlugin.test.tsx).
    const text = firstTextOf(markdownToLexicalState('==marked=='))
    expect(text.text).toBe('marked')
    expect(text.format).toBe(IS_HIGHLIGHT)
  })

  it('imports a footnote reference as literal text', function () {
    // No footnote transformer exists in this dialect; the paste dialect's
    // markdown-it-footnote handling is pinned in MarkdownPastePlugin.test.tsx.
    const text = firstTextOf(markdownToLexicalState('text[^1]'))
    expect(text.text).toBe('text[^1]')
    expect(text.format).toBe(0)
  })

  it('converts ~sub~ and ^sup^ via the custom text format transformers', function () {
    expect(firstTextOf(markdownToLexicalState('~sub~')).format).toBe(IS_SUBSCRIPT)
    expect(firstTextOf(markdownToLexicalState('^sup^')).format).toBe(IS_SUPERSCRIPT)
  })
})
