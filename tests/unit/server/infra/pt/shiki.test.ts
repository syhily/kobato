import { bundledLanguages, createHighlighter } from 'shiki'
import { describe, expect, it } from 'vitest'

import { SHIKI_SUPPORTED_LANGUAGES, SHIKI_THEMES, createShikiHighlighter } from '@/server/infra/pt/shiki'
import { HIGHLIGHT_LANGUAGES } from '@/shared/constants/languages'

// Real-Shiki coverage for the fine-grained wiring in
// `src/server/infra/pt/shiki.ts`: the 36 explicit language registrations +
// Oniguruma engine must produce BYTE-IDENTICAL HTML to the full `shiki`
// bundle's `createHighlighter` (same grammars, same themes, same engine),
// and the supported-language gate must match the old
// `block.language in bundledLanguages` check. Runs the real highlighters —
// no mocks — so a future shiki/lang upgrade that renames a grammar or
// changes an embedded dependency fails here instead of in production.

const SAMPLES: { language: string; code: string }[] = [
  { language: 'typescript', code: 'const x: number = 42\n' },
  { language: 'bash', code: 'curl -fsSL https://example.com | sh\n' },
  { language: 'vue', code: '<template><p>{{ msg }}</p></template>\n' },
  { language: 'ruby', code: 'def hello = puts("hi")\n' },
  { language: 'cpp', code: '#include <cstdio>\nint main() { return 0; }\n' },
  { language: 'json', code: '{"a": [1, 2, 3]}\n' },
  { language: 'markdown', code: '# Title\n\n```ts\nconst a = 1\n```\n' },
  { language: 'tex', code: '\\frac{a}{b}\n' },
  { language: 'diff', code: '- old\n+ new\n' },
  { language: 'objective-c', code: 'NSString *s = @"hi";\n' },
]

describe('infra/pt/shiki — fine-grained highlighter', () => {
  it('SHIKI_SUPPORTED_LANGUAGES equals HIGHLIGHT_LANGUAGES (and the old bundle filter)', () => {
    expect([...SHIKI_SUPPORTED_LANGUAGES].sort()).toEqual([...HIGHLIGHT_LANGUAGES].sort())
    // The previous runtime gate: every supported language exists in the
    // full bundle (grammar or alias) — verified so the Set swap is a
    // no-op behaviorally.
    for (const lang of HIGHLIGHT_LANGUAGES) {
      expect(SHIKI_SUPPORTED_LANGUAGES.has(lang), lang).toBe(lang in bundledLanguages)
    }
  })

  it('highlights every supported language without throwing', async () => {
    const highlighter = await createShikiHighlighter()
    for (const lang of HIGHLIGHT_LANGUAGES) {
      const html = highlighter.codeToHtml(`x = 1\n`, {
        lang,
        themes: SHIKI_THEMES,
        defaultColor: false,
      })
      expect(html, lang).toContain('class="shiki')
    }
  })

  it('produces byte-identical HTML to the full shiki bundle', async () => {
    const [fine, full] = await Promise.all([
      createShikiHighlighter(),
      createHighlighter({
        langs: HIGHLIGHT_LANGUAGES.filter((lang) => lang in bundledLanguages),
        themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
      }),
    ])
    for (const { language, code } of SAMPLES) {
      const options = { lang: language, themes: SHIKI_THEMES, defaultColor: false } as const
      expect(fine.codeToHtml(code, options), language).toBe(full.codeToHtml(code, options))
    }
  })

  it('renders the plain-text fallback for unsupported languages', async () => {
    const highlighter = await createShikiHighlighter()
    expect(SHIKI_SUPPORTED_LANGUAGES.has('brainfuck')).toBe(false)
    const html = highlighter.codeToHtml('not a supported language\n', {
      lang: 'text',
      themes: SHIKI_THEMES,
      defaultColor: false,
    })
    expect(html).toContain('class="shiki')
  })
})
