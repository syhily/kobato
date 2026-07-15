import { describe, expect, it } from 'vitest'

import { isSafeUrl, sanitizeUrl } from '@/shared/sanitize-url'

describe('shared: sanitize-url', () => {
  describe('isSafeUrl', () => {
    it('allows http(s), mailto, and tel URLs', () => {
      expect(isSafeUrl('https://example.com')).toBe(true)
      expect(isSafeUrl('http://localhost:3000')).toBe(true)
      expect(isSafeUrl('mailto:a@b.com')).toBe(true)
      expect(isSafeUrl('tel:+123456')).toBe(true)
    })

    it('allows relative paths, anchors, and protocol-relative URLs', () => {
      expect(isSafeUrl('/posts/1')).toBe(true)
      expect(isSafeUrl('#section')).toBe(true)
      expect(isSafeUrl('//cdn.example.com/x.js')).toBe(true)
    })

    it('rejects javascript:, data:, and vbscript: protocols', () => {
      expect(isSafeUrl('javascript:alert(1)')).toBe(false)
      expect(isSafeUrl('  javascript:alert(1)')).toBe(false)
      expect(isSafeUrl('data:text/html,<script>')).toBe(false)
      expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false)
    })

    it('rejects control-character smuggling like java\\tscript:', () => {
      // Browsers strip C0 control characters when parsing the protocol, so
      // `java\tscript:` IS `javascript:` at runtime. The sanitizer must
      // strip before validating, otherwise the regex sees a "safe" string.
      expect(isSafeUrl('java\tscript:alert(1)')).toBe(false)
      expect(isSafeUrl('java\nscript:alert(1)')).toBe(false)
      expect(isSafeUrl('java\rscript:alert(1)')).toBe(false)
      expect(isSafeUrl('jav	ascript:alert(1)')).toBe(false)
      expect(isSafeUrl('java\u0000script:alert(1)')).toBe(false)
      expect(isSafeUrl('java\u000Bscript:alert(1)')).toBe(false)
      expect(isSafeUrl('java\u000Cscript:alert(1)')).toBe(false)
    })

    it('rejects empty and whitespace-only URLs', () => {
      expect(isSafeUrl('')).toBe(false)
      expect(isSafeUrl('   ')).toBe(false)
      expect(isSafeUrl('\t\n')).toBe(false)
      expect(isSafeUrl('\t\n\r')).toBe(false)
    })
  })

  describe('sanitizeUrl', () => {
    it('returns safe URLs unchanged', () => {
      expect(sanitizeUrl('https://example.com/x?y=1')).toBe('https://example.com/x?y=1')
      expect(sanitizeUrl('/post/1')).toBe('/post/1')
    })

    it('returns the fallback for dangerous or empty URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('#')
      expect(sanitizeUrl('java\tscript:alert(1)')).toBe('#')
      expect(sanitizeUrl('java\u0000script:alert(1)')).toBe('#')
      expect(sanitizeUrl('')).toBe('#')
      expect(sanitizeUrl('  \t ')).toBe('#')
      expect(sanitizeUrl('data:text/html,<script>', 'about:blank')).toBe('about:blank')
    })

    it('strips control characters from otherwise safe URLs', () => {
      expect(sanitizeUrl('https://exa\tmple.com')).toBe('https://example.com')
    })
  })
})
