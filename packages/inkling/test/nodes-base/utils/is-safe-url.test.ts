import { describe, expect, it } from 'vitest'

import { isSafeMediaUrl, isSafeUrl } from '@/nodes/base/utils/is-safe-url'

describe('isSafeUrl', () => {
  it('allows http URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true)
  })

  it('allows https URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true)
  })

  it('allows relative URLs', () => {
    expect(isSafeUrl('/content/images/example.png')).toBe(true)
    expect(isSafeUrl('relative/path')).toBe(true)
  })

  it('rejects data URLs', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeUrl('data:image/png;base64,abc')).toBe(false)
  })

  it('rejects blob URLs', () => {
    expect(isSafeUrl('blob:https://example.com/1234')).toBe(false)
  })

  it('rejects javascript URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects mailto, tel, and ftp URLs', () => {
    // export-side navigation policy keeps only http/https/relative. The input
    // side (`isPasteableLinkUrl` in `@/plugins/behaviour/clipboard-protocol`)
    // deliberately accepts these schemes; the divergence is pinned in
    // `test/unit/plugins/behaviour/clipboard-protocol.test.tsx`.
    expect(isSafeUrl('mailto:test@example.com')).toBe(false)
    expect(isSafeUrl('tel:+1234567890')).toBe(false)
    expect(isSafeUrl('ftp://example.com/file.txt')).toBe(false)
  })

  it('rejects URLs with control characters or whitespace inside the scheme', () => {
    // browsers strip ASCII tab/LF/CR before scheme parsing, so these would
    // otherwise be treated as relative URLs and navigated as javascript:
    expect(isSafeUrl('jav\tascript:alert(1)')).toBe(false)
    expect(isSafeUrl('java\nscript:alert(1)')).toBe(false)
    expect(isSafeUrl('java\rscript:alert(1)')).toBe(false)
  })

  it('rejects URLs with spaces in the path', () => {
    expect(isSafeUrl('https://example.com/a b')).toBe(false)
  })

  it('still allows safe URLs after the control-character check', () => {
    expect(isSafeUrl('/relative/path')).toBe(true)
    expect(isSafeUrl('https://example.com')).toBe(true)
  })

  it('rejects empty strings', () => {
    expect(isSafeUrl('')).toBe(false)
    expect(isSafeUrl('   ')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isSafeUrl(null as unknown as string)).toBe(false)
    expect(isSafeUrl(undefined as unknown as string)).toBe(false)
    expect(isSafeUrl(123 as unknown as string)).toBe(false)
  })
})

describe('isSafeMediaUrl', () => {
  it('allows http URLs', () => {
    expect(isSafeMediaUrl('http://example.com/video.mp4')).toBe(true)
  })

  it('allows https URLs', () => {
    expect(isSafeMediaUrl('https://example.com/image.png')).toBe(true)
  })

  it('allows relative URLs', () => {
    expect(isSafeMediaUrl('/content/images/example.png')).toBe(true)
  })

  it('allows data URLs', () => {
    expect(isSafeMediaUrl('data:image/png;base64,abc')).toBe(true)
    expect(isSafeMediaUrl('data:text/html,<p>hello</p>')).toBe(true)
  })

  it('allows blob URLs', () => {
    expect(isSafeMediaUrl('blob:https://example.com/1234')).toBe(true)
  })

  it('rejects javascript URLs', () => {
    expect(isSafeMediaUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects URLs with control characters or whitespace inside the scheme', () => {
    // browsers strip ASCII tab/LF/CR before scheme parsing, so these would
    // otherwise be treated as relative URLs and navigated as javascript:
    expect(isSafeMediaUrl('jav\tascript:alert(1)')).toBe(false)
    expect(isSafeMediaUrl('java\nscript:alert(1)')).toBe(false)
    expect(isSafeMediaUrl('java\rscript:alert(1)')).toBe(false)
  })

  it('rejects URLs with spaces in the path', () => {
    expect(isSafeMediaUrl('https://example.com/a b')).toBe(false)
  })

  it('still allows safe URLs after the control-character check', () => {
    expect(isSafeMediaUrl('/relative/path')).toBe(true)
    expect(isSafeMediaUrl('https://example.com')).toBe(true)
    expect(isSafeMediaUrl('data:image/png;base64,abc')).toBe(true)
  })

  it('rejects empty strings', () => {
    expect(isSafeMediaUrl('')).toBe(false)
    expect(isSafeMediaUrl('   ')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isSafeMediaUrl(null as unknown as string)).toBe(false)
    expect(isSafeMediaUrl(undefined as unknown as string)).toBe(false)
    expect(isSafeMediaUrl(123 as unknown as string)).toBe(false)
  })
})
