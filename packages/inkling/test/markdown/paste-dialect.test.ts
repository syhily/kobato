import { pasteDialect } from '@/markdown/paste-dialect'

describe('Paste dialect markdown-it engine', function () {
  describe('latest', function () {
    it('outputs urlencoded headers', function () {
      const markdown = `\n# Header One\n\n## Héader Two\n`
      const result = pasteDialect.render(markdown, { inklingVersion: '4.0' })
      expect(result).toMatch(/<h1 id="header-one">/)
      expect(result).toMatch(/<h2 id="h%C3%A9ader-two">/)
    })

    it('deduplicates heading ids', function () {
      const result = pasteDialect.render('# Hello\n# Hello', { inklingVersion: '4.0' })
      expect(result).toMatch(/<h1 id="hello">/)
      // the shared dedup policy (`@/utils/heading-id-tracker`): repeats get
      // the hyphenated `<base>-<n>` form, same as the HTML renderer
      expect(result).toMatch(/<h1 id="hello-1">/)
    })

    it('does not leak heading dedup state across pasteDialect.render() calls', function () {
      const first = pasteDialect.render('# Hello', { inklingVersion: '4.0' })
      const second = pasteDialect.render('# Hello', { inklingVersion: '4.0' })
      expect(first).toMatch(/<h1 id="hello">/)
      expect(second).toMatch(/<h1 id="hello">/)

      const firstLegacy = pasteDialect.render('# Hello', { inklingVersion: '3.0' })
      const secondLegacy = pasteDialect.render('# Hello', { inklingVersion: '3.0' })
      expect(firstLegacy).toMatch(/<h1 id="hello">/)
      expect(secondLegacy).toMatch(/<h1 id="hello">/)
    })

    it('outputs `loading="lazy"` on images', function () {
      const markdown = `![](https://mysite.com/content/images/lazy.png)`
      const result = pasteDialect.render(markdown, { inklingVersion: '4.0' })
      expect(result).toContain('loading="lazy"')
    })
  })

  describe('<4.x', function () {
    it('outputs `loading="lazy"` on images', function () {
      const markdown = `![](https://mysite.com/content/images/lazy.png)`
      const result = pasteDialect.render(markdown, { inklingVersion: '3.0' })
      expect(result).toContain('loading="lazy"')
    })

    it('outputs backwards compatible headers', function () {
      const markdown = `\n# Header One\n\n## Héader Two\n`
      const result = pasteDialect.render(markdown, { inklingVersion: '3.0' })
      expect(result).toMatch(/<h1 id="headerone">/)
      expect(result).toMatch(/<h2 id="hadertwo">/)
    })
  })
})
