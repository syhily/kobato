import { honeypotField } from '@kobato/shared/utils/schema'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('honeypotField', () => {
  it('defaults its named field to empty and rejects a filled value', () => {
    const subtitle = honeypotField('subtitle')
    const schema = z.object({ subtitle: subtitle.schema }).superRefine(subtitle.refine)

    expect(schema.parse({})).toEqual({ subtitle: '' })
    expect(schema.safeParse({ subtitle: 'spam' }).error?.issues).toEqual([
      expect.objectContaining({ path: ['subtitle'], message: '输入数据无效。' }),
    ])
  })

  it('preserves distinct field names and the shared 240-character cap', () => {
    const contact = honeypotField('contact')
    const schema = z.object({ contact: contact.schema }).superRefine(contact.refine)

    expect(schema.safeParse({ contact: 'x'.repeat(240) }).success).toBe(false)
    expect(schema.safeParse({ contact: 'x'.repeat(241) }).error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['contact'], code: 'too_big' })]),
    )
  })
})
