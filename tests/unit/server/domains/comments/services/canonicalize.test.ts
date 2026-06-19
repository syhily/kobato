import { describe, expect, it } from 'vitest'

import { inklingFromPt, inklingLink } from '#/_helpers/inkling'
import { canonicalizeCommentBody } from '@/server/domains/comments/services/canonicalize'

describe('security / XSS payload — canonicalizeCommentBody', () => {
  it('accepts plain text containing script-like strings (XSS defense is renderer-side)', async () => {
    const result = await canonicalizeCommentBody(
      inklingFromPt([
        {
          _type: 'block',
          _key: 'a',
          style: 'normal',
          children: [{ _type: 'span', _key: 'b', text: '<script>alert(1)</script>', marks: [] }],
        },
      ]),
    )
    expect(result.content).toContain('<script>alert(1)</script>')
  })

  it('rejects javascript: scheme in link href', async () => {
    await expect(canonicalizeCommentBody(inklingLink("javascript:alert('xss')", 'click'))).rejects.toThrow()
  })

  it('accepts plain text containing onerror-like strings (XSS defense is renderer-side)', async () => {
    const result = await canonicalizeCommentBody(
      inklingFromPt([
        {
          _type: 'block',
          _key: 'a',
          style: 'normal',
          children: [{ _type: 'span', _key: 'b', text: '![x](y" onerror=alert(1))', marks: [] }],
        },
      ]),
    )
    expect(result.content).toContain('onerror=alert(1)')
  })
})
