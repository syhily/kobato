/**
 * Tests for the shared URL sanitizer (`src/shared/sanitize-url.ts`).
 *
 * Covers:
 *   1. Protocol whitelist (http, https, mailto, tel — allowed;
 *      javascript, data, vbscript — blocked).
 *   2. Control-character stripping (SEC-1: tab, newline, null, etc.
 *      must be removed before protocol checking to prevent XSS bypass).
 *   3. Relative paths, anchor links, protocol-relative URLs.
 *   4. Empty / whitespace-only URLs.
 */

import { describe, expect, it } from 'vitest'

import { isSafeUrl, sanitizeUrl } from '@/shared/sanitize-url'

describe('isSafeUrl', () => {
  // --- allowed protocols ------------------------------------------------------

  it('allows https://', () => {
    expect(isSafeUrl('https://example.com')).toBe(true)
  })

  it('allows http://', () => {
    expect(isSafeUrl('http://example.com')).toBe(true)
  })

  it('allows mailto:', () => {
    expect(isSafeUrl('mailto:someone@example.com')).toBe(true)
  })

  it('allows tel:', () => {
    expect(isSafeUrl('tel:+1234567890')).toBe(true)
  })

  // --- blocked protocols ------------------------------------------------------

  it('blocks javascript:', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
  })

  it('blocks data:', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('blocks vbscript:', () => {
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false)
  })

  // --- SEC-1: control-character bypass ----------------------------------------

  it('blocks javascript: with tab separator (SEC-1)', () => {
    // Browser strips tab when parsing protocol → equivalent to javascript:
    expect(isSafeUrl('java\tscript:alert(1)')).toBe(false)
  })

  it('blocks javascript: with newline separator (SEC-1)', () => {
    expect(isSafeUrl('java\nscript:alert(1)')).toBe(false)
  })

  it('blocks javascript: with null byte separator (SEC-1)', () => {
    expect(isSafeUrl('java\u0000script:alert(1)')).toBe(false)
  })

  it('blocks javascript: with vertical-tab separator (SEC-1)', () => {
    expect(isSafeUrl('java\u000Bscript:alert(1)')).toBe(false)
  })

  it('blocks javascript: with form-feed separator (SEC-1)', () => {
    expect(isSafeUrl('java\u000Cscript:alert(1)')).toBe(false)
  })

  it('blocks javascript: with carriage-return separator (SEC-1)', () => {
    expect(isSafeUrl('java\rscript:alert(1)')).toBe(false)
  })

  // --- relative paths and anchors ---------------------------------------------

  it('allows relative path', () => {
    expect(isSafeUrl('/posts/hello')).toBe(true)
  })

  it('allows anchor link', () => {
    expect(isSafeUrl('#section')).toBe(true)
  })

  it('allows protocol-relative URL', () => {
    expect(isSafeUrl('//cdn.example.com/lib.js')).toBe(true)
  })

  // --- empty / whitespace -----------------------------------------------------

  it('rejects empty string', () => {
    expect(isSafeUrl('')).toBe(false)
  })

  it('rejects whitespace-only string', () => {
    expect(isSafeUrl('   ')).toBe(false)
  })

  it('rejects control-characters-only string', () => {
    expect(isSafeUrl('\t\n\r')).toBe(false)
  })
})

describe('sanitizeUrl', () => {
  // --- safe URLs returned unchanged -------------------------------------------

  it('returns safe URL unchanged', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com')
  })

  it('returns relative path unchanged', () => {
    expect(sanitizeUrl('/posts/hello')).toBe('/posts/hello')
  })

  it('strips control characters from otherwise-safe URL', () => {
    // The tab should be stripped, leaving a valid https:// URL.
    expect(sanitizeUrl('https://exam\tple.com')).toBe('https://example.com')
  })

  // --- dangerous URLs replaced with fallback ----------------------------------

  it('replaces javascript: with fallback', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('#')
  })

  it('replaces javascript: with control-char bypass with fallback (SEC-1)', () => {
    expect(sanitizeUrl('java\tscript:alert(1)')).toBe('#')
    expect(sanitizeUrl('java\nscript:alert(1)')).toBe('#')
    expect(sanitizeUrl('java\u0000script:alert(1)')).toBe('#')
  })

  it('replaces data: with fallback', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('#')
  })

  it('replaces vbscript: with fallback', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('#')
  })

  it('uses custom fallback when provided', () => {
    expect(sanitizeUrl('javascript:alert(1)', 'about:blank')).toBe('about:blank')
  })

  it('returns fallback for empty string', () => {
    expect(sanitizeUrl('')).toBe('#')
    expect(sanitizeUrl('  \t ')).toBe('#')
  })
})
