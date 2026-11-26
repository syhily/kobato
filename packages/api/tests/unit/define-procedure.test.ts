import type { NoMeta, ProcedureRouteOf, RpcProcedureMeta } from '@kobato/api/rpc/define-procedure'
import type { InferContractRouterInputs, InferContractRouterOutputs } from '@orpc/contract'

import { likeDecreaseOutput, likeIncreaseInput, likeIncreaseOutput } from '@kobato/api/contracts/public/likes'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'
import { isContractProcedure, oc } from '@orpc/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

const countOutput = z.object({ likes: z.number().int().nonnegative() })

const increase = defineProcedure({ method: 'POST', path: '/likes/increase' })
  .input(likeIncreaseInput)
  .output(likeIncreaseOutput)
const count = defineProcedure({ method: 'GET', path: '/likes/count' }).output(countOutput)
const noop = defineProcedure({ method: 'DELETE', path: '/likes/noop' })

const PROCEDURES = [
  ['increase', increase, { method: 'POST', path: '/likes/increase' }],
  ['count', count, { method: 'GET', path: '/likes/count' }],
  ['noop', noop, { method: 'DELETE', path: '/likes/noop' }],
] as const

describe('defineProcedure runtime', () => {
  it('yields native oRPC contract procedures', () => {
    for (const [, procedure] of PROCEDURES) {
      expect(isContractProcedure(procedure)).toBe(true)
    }
  })

  it.each(PROCEDURES)('%s stores the declared route verbatim', (_key, procedure, route) => {
    expect(procedure['~orpc'].route).toEqual(route)
    expect(procedure['~orpc'].route.method).toBe(route.method)
    expect(procedure['~orpc'].route.path).toBe(route.path)
  })

  it('keeps the contract schemas by reference and leaves absent stages undefined', () => {
    expect(increase['~orpc'].inputSchema).toBe(likeIncreaseInput)
    expect(increase['~orpc'].outputSchema).toBe(likeIncreaseOutput)
    expect(count['~orpc'].inputSchema).toBeUndefined()
    expect(count['~orpc'].outputSchema).toBe(countOutput)
    expect(noop['~orpc'].inputSchema).toBeUndefined()
    expect(noop['~orpc'].outputSchema).toBeUndefined()
    expect(increase['~orpc'].errorMap).toEqual({})
    expect(increase['~orpc'].meta).toEqual({})
  })

  it('matches what oc.route produces for the same declaration', () => {
    const plain = oc
      .route({ method: 'POST', path: '/likes/increase' })
      .input(likeIncreaseInput)
      .output(likeIncreaseOutput)
    expect(increase['~orpc']).toEqual(plain['~orpc'])
    expect(increase['~orpc'].inputSchema).toBe(plain['~orpc'].inputSchema)
    expect(increase['~orpc'].outputSchema).toBe(plain['~orpc'].outputSchema)
  })

  it('validates input and output through the referenced schemas', () => {
    expect(increase['~orpc'].inputSchema!.parse({ key: 'post:1' })).toEqual({ key: 'post:1' })
    expect(increase['~orpc'].inputSchema!.safeParse({}).success).toBe(false)
    expect(increase['~orpc'].outputSchema!.parse({ key: 'post:1', likes: 3 })).toEqual({ key: 'post:1', likes: 3 })
    expect(increase['~orpc'].outputSchema!.safeParse({ key: 'post:1', likes: -1 }).success).toBe(false)
    expect(count['~orpc'].outputSchema!.parse({ likes: 0 })).toEqual({ likes: 0 })
    expect(count['~orpc'].outputSchema!.safeParse({ likes: 'many' }).success).toBe(false)
    expect(likeDecreaseOutput.safeParse({ key: 'post:1', likes: 1 }).success).toBe(true)
  })
})

describe('defineProcedure types', () => {
  it('pins the method and path literals on the route brand for every chain shape', () => {
    expectTypeOf(increase['~orpc'].route.method).toEqualTypeOf<'POST'>()
    expectTypeOf(increase['~orpc'].route.path).toEqualTypeOf<'/likes/increase'>()
    expectTypeOf(count['~orpc'].route.method).toEqualTypeOf<'GET'>()
    expectTypeOf(count['~orpc'].route.path).toEqualTypeOf<'/likes/count'>()
    expectTypeOf(noop['~orpc'].route.method).toEqualTypeOf<'DELETE'>()
    expectTypeOf(noop['~orpc'].route.path).toEqualTypeOf<'/likes/noop'>()
    expectTypeOf<ProcedureRouteOf<typeof increase>>().toEqualTypeOf<{ method: 'POST'; path: '/likes/increase' }>()
    // @ts-expect-error — the method literal is part of the brand
    const _wrongMethod: 'GET' = increase['~orpc'].route.method
    // @ts-expect-error — the path literal is part of the brand
    const _wrongPath: '/likes/decrease' = increase['~orpc'].route.path
  })

  it('keeps the input and output schema types flowing into oRPC inference', () => {
    expectTypeOf<InferContractRouterInputs<typeof increase>>().toEqualTypeOf<{ key: string }>()
    expectTypeOf<InferContractRouterOutputs<typeof increase>>().toEqualTypeOf<{
      key: string
      likes: number
      token?: string | undefined
    }>()
    expectTypeOf<InferContractRouterInputs<typeof count>>().toEqualTypeOf<unknown>()
    expectTypeOf<InferContractRouterOutputs<typeof count>>().toEqualTypeOf<{ likes: number }>()
    // @ts-expect-error — input shape comes from likeIncreaseInput
    expectTypeOf<InferContractRouterInputs<typeof increase>>().toEqualTypeOf<{ key: number }>()
    // @ts-expect-error — output shape comes from countOutput
    expectTypeOf<InferContractRouterOutputs<typeof count>>().toEqualTypeOf<{ likes: string }>()
  })

  it('rejects routes that are not a verb plus a rooted path, and non-schema stages', () => {
    // @ts-expect-error — method must be an HTTP verb
    defineProcedure({ method: 'FETCH', path: '/likes/increase' })
    // @ts-expect-error — path must be rooted
    defineProcedure({ method: 'POST', path: 'likes/increase' })
    // @ts-expect-error — path is required alongside the method
    defineProcedure({ method: 'POST' })
    // @ts-expect-error — input must be a schema
    defineProcedure({ method: 'POST', path: '/likes/increase' }).input({ key: z.string() })
    // @ts-expect-error — output must be a schema
    defineProcedure({ method: 'POST', path: '/likes/increase' }).output({ likes: 1 })
    // @ts-expect-error — input cannot be declared twice
    defineProcedure({ method: 'POST', path: '/likes/increase' }).input(likeIncreaseInput).input(likeIncreaseInput)
    expect(true).toBe(true)
  })

  it('reports no brand for plain oc.route procedures', () => {
    const plain = oc.route({ method: 'POST', path: '/likes/increase' }).output(likeIncreaseOutput)
    expectTypeOf<ProcedureRouteOf<typeof plain>>().toEqualTypeOf<unknown>()
    expectTypeOf<ProcedureRouteOf<typeof countOutput>>().toEqualTypeOf<unknown>()
  })

  it('keeps a generic base path as a placeholder so call sites get the exact literal', () => {
    function family<const TBase extends string>(base: `/${TBase}`) {
      return defineProcedure({ method: 'POST', path: `${base}/save-draft` })
        .input(likeIncreaseInput)
        .output(likeIncreaseOutput)
    }
    const posts = family('/admin/posts')
    const pages = family('/admin/pages')
    expectTypeOf(posts['~orpc'].route.method).toEqualTypeOf<'POST'>()
    expectTypeOf(posts['~orpc'].route.path).toEqualTypeOf<'/admin/posts/save-draft'>()
    expectTypeOf(pages['~orpc'].route.path).toEqualTypeOf<'/admin/pages/save-draft'>()
    expectTypeOf<InferContractRouterInputs<typeof posts>>().toEqualTypeOf<{ key: string }>()
    // @ts-expect-error — the generic is instantiated, not widened to `/${string}/save-draft`
    expectTypeOf<(typeof posts)['~orpc']['route']['path']>().toEqualTypeOf<`/${string}/save-draft`>()
    // @ts-expect-error — the pages base is a different literal
    expectTypeOf<(typeof posts)['~orpc']['route']['path']>().toEqualTypeOf<'/admin/pages/save-draft'>()
    expect(posts['~orpc'].route).toEqual({ method: 'POST', path: '/admin/posts/save-draft' })
    expect(pages['~orpc'].route).toEqual({ method: 'POST', path: '/admin/pages/save-draft' })
    expect(posts['~orpc'].inputSchema).toBe(likeIncreaseInput)
  })
})

describe('defineProcedure publicRead metadata', () => {
  const read = defineProcedure({ method: 'GET', path: '/content/home' }, { publicRead: true })
    .input(likeIncreaseInput)
    .output(likeIncreaseOutput)
  const readOutputOnly = defineProcedure({ method: 'GET', path: '/github/avatar' }, { publicRead: true }).output(
    likeIncreaseOutput,
  )

  it('writes the marker through the native oc.$meta chain, preserved by input/output links', () => {
    expect(read['~orpc'].meta).toEqual({ publicRead: true })
    expect(read['~orpc'].meta.publicRead).toBe(true)
    expect(readOutputOnly['~orpc'].meta).toEqual({ publicRead: true })
    const plain = oc
      .$meta({ publicRead: true })
      .route({ method: 'GET', path: '/content/home' })
      .input(likeIncreaseInput)
      .output(likeIncreaseOutput)
    expect(read['~orpc']).toEqual(plain['~orpc'])
  })

  it('leaves the route brand and referenced schemas untouched by the marker', () => {
    expect(read['~orpc'].route).toEqual({ method: 'GET', path: '/content/home' })
    expect(read['~orpc'].inputSchema).toBe(likeIncreaseInput)
    expect(read['~orpc'].outputSchema).toBe(likeIncreaseOutput)
    expect(isContractProcedure(read)).toBe(true)
  })

  it('pins the literal meta type through every chain shape and keeps the unmarked default', () => {
    expectTypeOf(read['~orpc'].meta).toMatchTypeOf<RpcProcedureMeta>()
    expectTypeOf(read['~orpc'].meta.publicRead).toEqualTypeOf<true>()
    expectTypeOf(readOutputOnly['~orpc'].meta.publicRead).toEqualTypeOf<true>()
    expectTypeOf(increase['~orpc'].meta).toEqualTypeOf<NoMeta>()
    // @ts-expect-error — the marker is the literal true, never a widened boolean
    expectTypeOf(read['~orpc'].meta.publicRead).toEqualTypeOf<boolean>()
    // @ts-expect-error — the option accepts only the literal true
    defineProcedure({ method: 'GET', path: '/content/other' }, { publicRead: 1 })
    // @ts-expect-error — the option accepts only the literal true, not false
    defineProcedure({ method: 'GET', path: '/content/other' }, { publicRead: false })
  })
})
