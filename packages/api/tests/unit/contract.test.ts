import type { AnyContractProcedure } from '@orpc/contract'

import { apiContract } from '@kobato/api/contract.ts'
import { likesContract } from '@kobato/api/likes.ts'
import { likeDecreaseInput, likeIncreaseInput, likeIncreaseOutput, likeValidateInput } from '@kobato/contracts/likes.ts'
import { isContractProcedure } from '@orpc/contract'
import { describe, expect, it } from 'vitest'

/** The deployed wire surface — drift here is a breaking URL change. */
const LIKES_ROUTES = {
  increase: { method: 'POST', path: '/likes/increase' },
  decrease: { method: 'POST', path: '/likes/decrease' },
  validate: { method: 'GET', path: '/likes/validate' },
} as const

function contractProcedures(router: Record<string, unknown>): Record<string, AnyContractProcedure> {
  return router as Record<string, AnyContractProcedure>
}

describe('likesContract shape', () => {
  it('exposes exactly the three procedures under their stable keys', () => {
    expect(Object.keys(likesContract)).toEqual(['increase', 'decrease', 'validate'])
    for (const procedure of Object.values(likesContract)) {
      expect(isContractProcedure(procedure)).toBe(true)
    }
  })

  it.each(Object.entries(LIKES_ROUTES))('%s pins the deployed method and path', (key, route) => {
    expect(likesContract[key as keyof typeof likesContract]['~orpc'].route).toEqual(route)
  })

  it('composes the @kobato/contracts schemas by reference, never a copy', () => {
    expect(likesContract.increase['~orpc'].inputSchema).toBe(likeIncreaseInput)
    expect(likesContract.increase['~orpc'].outputSchema).toBe(likeIncreaseOutput)
    expect(likesContract.decrease['~orpc'].inputSchema).toBe(likeDecreaseInput)
    expect(likesContract.validate['~orpc'].inputSchema).toBe(likeValidateInput)
  })

  it('keeps the contracts schemas behaviorally intact', () => {
    expect(likeIncreaseInput.safeParse({ key: 'post:1' }).success).toBe(true)
    expect(likeIncreaseInput.safeParse({}).success).toBe(false)
    // `decrease`/`validate` require the token; `increase` must not mint one eagerly.
    expect(likeDecreaseInput.safeParse({ key: 'post:1' }).success).toBe(false)
    expect(likeDecreaseInput.safeParse({ key: 'post:1', token: 'tok' }).success).toBe(true)
    expect(likeValidateInput.safeParse({ key: 'post:1', token: 'tok' }).success).toBe(true)
    // `token` stays optional on the increase output — absent when issuance is skipped.
    expect(likeIncreaseOutput.parse({ key: 'post:1', likes: 2 })).toEqual({ key: 'post:1', likes: 2 })
  })
})

describe('apiContract composition', () => {
  it('mirrors every top-level apiRouter domain', () => {
    expect(Object.keys(apiContract)).toEqual([
      'account',
      'analytics',
      'avatar',
      'github',
      'comments',
      'content',
      'friends',
      'image',
      'likes',
      'music',
      'newsletter',
      'notifications',
      'passkey',
      'webmention',
      'admin',
    ])
    expect(Object.keys(apiContract.admin)).toHaveLength(23)
  })

  it('composes the very same procedure objects as the domain module', () => {
    const procedures = contractProcedures(apiContract.likes as Record<string, unknown>)
    expect(procedures.increase).toBe(likesContract.increase)
    expect(procedures.decrease).toBe(likesContract.decrease)
    expect(procedures.validate).toBe(likesContract.validate)
  })
})
