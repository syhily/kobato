import { describe, expect, it } from 'vitest'

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
})
