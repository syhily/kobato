import { describe, expect, it } from 'vitest'

import { canonicalizeCommentBody } from '@/server/domains/comments/services/canonicalize'

describe('security / XSS payload — canonicalizeCommentBody', () => {
  it('accepts plain text containing script-like strings (XSS defense is renderer-side)', async () => {
    const result = await canonicalizeCommentBody([
      {
        _type: 'block',
        _key: 'a',
        style: 'normal',
        children: [{ _type: 'span', _key: 'b', text: '<script>alert(1)</script>', marks: [] }],
      },
    ])
    expect(result.content).toContain('<script>alert(1)</script>')
  })

  it('rejects javascript: scheme in link href', async () => {
    await expect(
      canonicalizeCommentBody([
        {
          _type: 'block',
          _key: 'a',
          style: 'normal',
          children: [{ _type: 'span', _key: 'b', text: 'click', marks: ['m1'] }],
          markDefs: [{ _type: 'link', _key: 'm1', href: "javascript:alert('xss')" }],
        },
      ]),
    ).rejects.toThrow()
  })

  it('accepts plain text containing onerror-like strings (XSS defense is renderer-side)', async () => {
    const result = await canonicalizeCommentBody([
      {
        _type: 'block',
        _key: 'a',
        style: 'normal',
        children: [{ _type: 'span', _key: 'b', text: '![x](y" onerror=alert(1))', marks: [] }],
      },
    ])
    expect(result.content).toContain('onerror=alert(1)')
  })
})
