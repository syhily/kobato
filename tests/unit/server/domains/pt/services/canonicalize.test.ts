import { describe, expect, it, vi } from 'vitest'

// Server prerender products are deterministic sentinels marking server-recomputed bytes.
vi.mock('katex', () => ({
  default: {
    renderToString: (tex: string) => `<math>server:${tex}</math>`,
  },
}))
vi.mock('katex/contrib/mhchem', () => ({}))
vi.mock('@/server/infra/pt/shiki', () => ({
  SHIKI_THEMES: { light: 'github-light', dark: 'github-dark' },
  SHIKI_SUPPORTED_LANGUAGES: new Set(['typescript', 'text']),
  createShikiHighlighter: () =>
    Promise.resolve({
      codeToHtml: (code: string) => `<pre>server:${code}</pre>`,
    }),
  shikiTransformers: () => [],
}))

import { canonicalizePortableTextBody } from '@/server/domains/pt/services/canonicalize'
import { DomainError } from '@/server/infra/http/errors'

const VALID_BODY = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    children: [{ _type: 'span', _key: 's1', text: 'Hello world' }],
  },
]

describe('pt/services/canonicalize — canonicalizePortableTextBody', () => {
  it('returns the canonicalized body for valid input', async () => {
    const body = await canonicalizePortableTextBody(VALID_BODY)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ _type: 'block', _key: 'b1' })
  })

  it('rejects non-array input with a BAD_REQUEST DomainError', async () => {
    const error = await canonicalizePortableTextBody(42).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ code: 'BAD_REQUEST', message: '正文格式不合法。' })
  })

  it('translates zod issues into the DomainError issues shape', async () => {
    const error = await canonicalizePortableTextBody([{ _type: 'block', _key: 'b1', style: 'normal' }]).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(DomainError)
    const { issues } = error as DomainError
    expect(Array.isArray(issues)).toBe(true)
    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.any(String), path: ['0', 'children'] })]),
    )
    for (const issue of issues ?? []) {
      expect(typeof issue.message).toBe('string')
      expect(issue.path === undefined || issue.path.every((segment) => typeof segment === 'string')).toBe(true)
    }
  })

  // P0-10 regression: strip client-supplied prerender products and let the server recompute.
  describe('strips client prerender products', () => {
    it('drops client highlightedHtml/mathml/svg and recomputes them server-side', async () => {
      const body = await canonicalizePortableTextBody([
        {
          _type: 'code',
          _key: 'c1',
          code: 'const x = 1',
          language: 'typescript',
          highlightedHtml: '<span>client-code</span>',
        },
        {
          _type: 'mathBlock',
          _key: 'm1',
          tex: 'x^2',
          mathml: '<math>client-mathml</math>',
          svg: '<svg>client-svg</svg>',
        },
        {
          _type: 'block',
          _key: 'b2',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'inline', marks: ['mi1'] }],
          markDefs: [
            {
              _type: 'mathInline',
              _key: 'mi1',
              tex: 'e=mc^2',
              mathml: '<math>client-inline</math>',
              svg: '<svg>client-inline-svg</svg>',
            },
          ],
        },
      ])

      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain('client-code')
      expect(serialized).not.toContain('client-mathml')
      expect(serialized).not.toContain('client-svg')
      expect(serialized).not.toContain('client-inline')
      // svg is legacy and never recomputed — it must be gone entirely.
      expect(serialized).toContain('server:const x = 1')
      expect(serialized).toContain('server:x^2')
      expect(serialized).toContain('server:e=mc^2')
      expect(serialized).not.toContain('<svg')
    })

    it('strips client products nested in solution and twoColumn containers', async () => {
      const body = await canonicalizePortableTextBody([
        {
          _type: 'solution',
          _key: 'sol1',
          children: [
            { _type: 'code', _key: 'c1', code: 'nested()', highlightedHtml: '<span>client-nested-code</span>' },
          ],
        },
        {
          _type: 'twoColumn',
          _key: 'tc1',
          left: [{ _type: 'mathBlock', _key: 'm1', tex: 'y', mathml: '<math>client-nested-mathml</math>' }],
          right: [],
        },
      ])

      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain('client-nested-code')
      expect(serialized).not.toContain('client-nested-mathml')
      expect(serialized).toContain('server:nested()')
      expect(serialized).toContain('server:y')
    })
  })
})
