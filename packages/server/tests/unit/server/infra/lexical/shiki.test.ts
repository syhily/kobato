import { HIGHLIGHT_LANGUAGES } from '@kobato/server/infra/lexical/highlight-languages'
import { SHIKI_SUPPORTED_LANGUAGES, SHIKI_THEMES, createShikiHighlighter } from '@kobato/server/infra/lexical/shiki'
import { bundledLanguages } from 'shiki'
import { describe, expect, it } from 'vitest'

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

describe('infra/lexical/shiki — bundled highlighter', () => {
  it('SHIKI_SUPPORTED_LANGUAGES equals HIGHLIGHT_LANGUAGES, all present in the shiki bundle', () => {
    expect([...SHIKI_SUPPORTED_LANGUAGES].sort()).toEqual([...HIGHLIGHT_LANGUAGES].sort())
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

  it('highlights the real-code samples', async () => {
    const highlighter = await createShikiHighlighter()
    for (const { language, code } of SAMPLES) {
      const html = highlighter.codeToHtml(code, { lang: language, themes: SHIKI_THEMES, defaultColor: false })
      expect(html, language).toContain('class="shiki')
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
