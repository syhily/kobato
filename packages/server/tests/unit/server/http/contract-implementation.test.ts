import type { apiContract } from '@kobato/api/contract'
import type { LikeIncreaseInput } from '@kobato/api/contracts/account/likes'
import type { ContractImplementation } from '@kobato/server/http/contract-implementation'
import type { AuthedHandlerContext, HandlerContext } from '@kobato/server/http/orpc-base'

import {
  likeDecreaseInput,
  likeDecreaseOutput,
  likeIncreaseInput,
  likeIncreaseOutput,
} from '@kobato/api/contracts/account/likes'
import { likesContract } from '@kobato/api/rpc/account/likes'
import { adminPagesContract } from '@kobato/api/rpc/admin/pages'
import { adminPostsContract } from '@kobato/api/rpc/admin/posts'
import {
  defineProcedure,
  type NoMeta,
  type ProcedureRoute,
  type ProcedureRouteOf,
  type PublicReadMeta,
} from '@kobato/api/rpc/define-procedure'
import { apiRouter } from '@kobato/server/http/api-router'
import { likesRouter } from '@kobato/server/http/controllers/account/likes.controller'
import { adminPagesRouter } from '@kobato/server/http/controllers/admin/pages.controller'
import { adminPostsRouter } from '@kobato/server/http/controllers/admin/posts.controller'
import { implementAuthed, implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base'
import { oc } from '@orpc/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

type LikesShape = ContractImplementation<typeof likesContract, HandlerContext>

type AllBranded<T> = T extends { '~orpc': unknown }
  ? ProcedureRouteOf<T> extends ProcedureRoute
    ? true
    : false
  : false extends { [K in keyof T]: AllBranded<T[K]> }[keyof T]
    ? false
    : true

const plainContract = { ping: oc.route({ method: 'POST', path: '/ping' }).output(z.object({ ok: z.boolean() })) }
const plainImpl = implementPublic(plainContract)
const plainPing = plainImpl.ping.handler(() => ({ ok: true }))

const impl = implementPublic(likesContract)

const ROUTES = [
  ['increase', 'POST', '/likes/increase'],
  ['decrease', 'POST', '/likes/decrease'],
  ['validate', 'GET', '/likes/validate'],
] as const

describe('contract implementer typing', () => {
  it('derives handler input, output, and context types from the contract', () => {
    impl.increase.handler(({ input, context }) => {
      expectTypeOf(input).toEqualTypeOf<LikeIncreaseInput>()
      expectTypeOf(context).toEqualTypeOf<HandlerContext>()
      return { key: input.key, likes: 0 }
    })
    implementAuthed(likesContract).decrease.handler(({ input, context }) => {
      expectTypeOf(input).toEqualTypeOf<{ key: string; token: string }>()
      expectTypeOf(context).toEqualTypeOf<AuthedHandlerContext>()
      return { key: input.key, likes: 0 }
    })
    expect(true).toBe(true)
  })

  it('rejects handler outputs that miss the contract output shape', () => {
    // @ts-expect-error — the output must satisfy likeIncreaseOutput (likes is missing)
    impl.increase.handler(({ input }) => ({ key: input.key }))
    // @ts-expect-error — authed handlers still answer with the contract output (likes must be a number)
    implementAuthed(likesContract).decrease.handler(({ input }) => ({ key: input.key, likes: 'none' }))
    expect(true).toBe(true)
  })

  it('keeps the route brand through procedure-level and router-level use()', () => {
    const procedureLevel = impl.increase.use(resourceRateLimit).handler(({ input }) => ({ key: input.key, likes: 0 }))
    const routerLevel = implementPublic(likesContract)
      .use(resourceRateLimit)
      .decrease.handler(({ input }) => ({ key: input.key, likes: 0 }))
    expectTypeOf(procedureLevel['~orpc'].route.method).toEqualTypeOf<'POST'>()
    expectTypeOf(procedureLevel['~orpc'].route.path).toEqualTypeOf<'/likes/increase'>()
    expectTypeOf(routerLevel['~orpc'].route.method).toEqualTypeOf<'POST'>()
    expectTypeOf(routerLevel['~orpc'].route.path).toEqualTypeOf<'/likes/decrease'>()
  })
})

describe('router composition against the contract', () => {
  it('likesRouter and its apiRouter mount carry the branded shape', () => {
    const composed: LikesShape = likesRouter
    const mounted: LikesShape = apiRouter.account.likes
    expectTypeOf(apiRouter).toExtend<ContractImplementation<typeof apiContract, HandlerContext>>()
    expectTypeOf(likesRouter.increase['~orpc'].route.method).toEqualTypeOf<'POST'>()
    expectTypeOf(likesRouter.increase['~orpc'].route.path).toEqualTypeOf<'/likes/increase'>()
    expectTypeOf(likesRouter.decrease['~orpc'].route.method).toEqualTypeOf<'POST'>()
    expectTypeOf(likesRouter.decrease['~orpc'].route.path).toEqualTypeOf<'/likes/decrease'>()
    expectTypeOf(likesRouter.validate['~orpc'].route.method).toEqualTypeOf<'GET'>()
    expectTypeOf(likesRouter.validate['~orpc'].route.path).toEqualTypeOf<'/likes/validate'>()
    for (const [key, method, path] of ROUTES) {
      expect(composed[key]['~orpc'].route.method).toBe(method)
      expect(composed[key]['~orpc'].route.path).toBe(path)
      expect(mounted[key]['~orpc'].route).toEqual(likesContract[key]['~orpc'].route)
    }
  })

  it('rejects implementations that drift from the branded contract', () => {
    const wrongMethod = implementPublic({
      ...likesContract,
      increase: defineProcedure({ method: 'GET', path: '/likes/increase' })
        .input(likeIncreaseInput)
        .output(likeIncreaseOutput),
    })
    const wrongPath = implementPublic({
      ...likesContract,
      increase: defineProcedure({ method: 'POST', path: '/likes/increment' })
        .input(likeIncreaseInput)
        .output(likeIncreaseOutput),
    })
    const wrongSchema = implementPublic({
      ...likesContract,
      validate: defineProcedure({ method: 'GET', path: '/likes/validate' })
        .input(z.object({ key: z.number() }))
        .output(z.object({ key: z.string(), valid: z.boolean() })),
    })
    const unbranded = implementPublic({
      ...likesContract,
      decrease: oc
        .route({ method: 'POST', path: '/likes/decrease' })
        .input(likeDecreaseInput)
        .output(likeDecreaseOutput),
    })

    const methodDrift: LikesShape = {
      ...likesRouter,
      // @ts-expect-error — increase is declared POST /likes/increase
      increase: wrongMethod.increase.handler(({ input }) => ({ key: input.key, likes: 0 })),
    }
    const pathDrift: LikesShape = {
      ...likesRouter,
      // @ts-expect-error — increase is declared POST /likes/increase
      increase: wrongPath.increase.handler(({ input }) => ({ key: input.key, likes: 0 })),
    }
    const schemaDrift: LikesShape = {
      ...likesRouter,
      // @ts-expect-error — validate takes { key: string; token: string }
      validate: wrongSchema.validate.handler(() => ({ key: 'post:1', valid: true })),
    }
    const brandless: LikesShape = {
      ...likesRouter,
      // @ts-expect-error — a plain oc.route procedure carries no route brand
      decrease: unbranded.decrease.handler(({ input }) => ({ key: input.key, likes: 0 })),
    }
    // @ts-expect-error — validate is missing
    const missingKey: LikesShape = { increase: likesRouter.increase, decrease: likesRouter.decrease }
    // @ts-expect-error — the contract declares no `extra` procedure
    const extraKey: LikesShape = { ...likesRouter, extra: likesRouter.validate }
    // @ts-expect-error — impl.router enforces the same shape before composition
    const atRouter = () => impl.router({ increase: likesRouter.increase, decrease: likesRouter.decrease })
    void methodDrift
    void pathDrift
    void schemaDrift
    void brandless
    void missingKey
    void extraKey
    void atRouter
  })

  it('rejects implementations of unbranded oc.route contracts (fail closed)', () => {
    expectTypeOf<ProcedureRouteOf<typeof plainPing>>().toEqualTypeOf<unknown>()
    expect(plainPing['~orpc'].route).toEqual({ method: 'POST', path: '/ping' })
    // @ts-expect-error — a plain oc.route procedure carries no route brand, so the leaf shape is unsatisfiable
    const plainShape: ContractImplementation<typeof plainContract, HandlerContext> = { ping: plainPing }
    // @ts-expect-error — impl.router applies the same fail-closed shape before composition
    const atRouter = () => plainImpl.router({ ping: plainPing })
    const inTree: ContractImplementation<{ nested: { ping: typeof plainPing } }, HandlerContext> = {
      // @ts-expect-error — mounting it anywhere in apiRouter would fail the satisfies the same way
      nested: { ping: plainPing },
    }
    void plainShape
    void atRouter
    void inTree
  })

  it('carries the declared publicRead meta through implementation and mounting', () => {
    expectTypeOf(apiRouter.public.content.home['~orpc'].meta).toEqualTypeOf<PublicReadMeta>()
    expectTypeOf(apiRouter.public.content.home['~orpc'].meta.publicRead).toEqualTypeOf<true>()
    expect(apiRouter.public.content.home['~orpc'].meta.publicRead).toBe(true)
    expectTypeOf(apiRouter.public.comments.getRaw['~orpc'].meta).toEqualTypeOf<NoMeta>()
    expect(apiRouter.public.comments.getRaw['~orpc'].meta).toEqual({})
  })

  it('every leaf of apiContract and apiRouter carries an exact route brand', () => {
    expectTypeOf<AllBranded<typeof apiContract>>().toEqualTypeOf<true>()
    expectTypeOf<AllBranded<typeof apiRouter>>().toEqualTypeOf<true>()
    expectTypeOf<AllBranded<typeof likesContract>>().toEqualTypeOf<true>()
    expectTypeOf<AllBranded<typeof adminPostsContract>>().toEqualTypeOf<true>()
    // one unbranded leaf anywhere turns the whole-tree check false
    expectTypeOf<AllBranded<typeof plainPing>>().toEqualTypeOf<false>()
    expectTypeOf<
      AllBranded<{ nested: { ok: typeof apiRouter.account.likes.increase; plain: typeof plainPing } }>
    >().toEqualTypeOf<false>()
  })
})

describe('template-path contracts (revision factory)', () => {
  type PostsShape = ContractImplementation<typeof adminPostsContract, HandlerContext>
  type PagesShape = ContractImplementation<typeof adminPagesContract, HandlerContext>
  type PostsDraftPath = (typeof adminPostsRouter.saveDraft)['~orpc']['route']['path']
  type PostsLatestPath = (typeof adminPostsRouter.publishLatest)['~orpc']['route']['path']
  type PagesDraftPath = (typeof adminPagesRouter.saveDraft)['~orpc']['route']['path']
  type PagesLatestPath = (typeof adminPagesRouter.publishLatest)['~orpc']['route']['path']
  type RevisionMethod = (typeof adminPostsRouter.saveDraft)['~orpc']['route']['method']

  it('brands the posts and pages revision routers with their exact base paths', () => {
    const posts: PostsShape = adminPostsRouter
    const pages: PagesShape = adminPagesRouter
    const mounted: PostsShape = apiRouter.admin.posts
    expectTypeOf<RevisionMethod>().toEqualTypeOf<'POST'>()
    expectTypeOf<PostsDraftPath>().toEqualTypeOf<'/admin/posts/save-draft'>()
    expectTypeOf<PostsLatestPath>().toEqualTypeOf<'/admin/posts/publish-latest'>()
    expectTypeOf<PagesDraftPath>().toEqualTypeOf<'/admin/pages/save-draft'>()
    expectTypeOf<PagesLatestPath>().toEqualTypeOf<'/admin/pages/publish-latest'>()
    // @ts-expect-error — the posts draft is not branded with the pages path
    expectTypeOf<PostsDraftPath>().toEqualTypeOf<'/admin/pages/save-draft'>()
    // @ts-expect-error — not widened to `/${string}/publish-latest`
    expectTypeOf<PagesLatestPath>().toEqualTypeOf<`/${string}/publish-latest`>()
    for (const [router, base] of [
      [adminPostsRouter, '/admin/posts'],
      [adminPagesRouter, '/admin/pages'],
    ] as const) {
      expect(router.saveDraft['~orpc'].route).toEqual({ method: 'POST', path: `${base}/save-draft` })
      expect(router.publishLatest['~orpc'].route).toEqual({ method: 'POST', path: `${base}/publish-latest` })
      expect(router.saveDraft['~orpc'].inputSchema).toBe(adminPostsContract.saveDraft['~orpc'].inputSchema)
      expect(router.saveDraft['~orpc'].outputSchema).toBe(adminPostsContract.saveDraft['~orpc'].outputSchema)
    }
    expect(mounted.saveDraft['~orpc'].route).toEqual(adminPostsContract.saveDraft['~orpc'].route)
    expect(mounted.publishLatest['~orpc'].route).toEqual(adminPostsContract.publishLatest['~orpc'].route)
    void posts
    void pages
  })

  it('refuses revision procedures from the sibling family', () => {
    const pagesIntoPosts: PostsShape = {
      ...adminPostsRouter,
      // @ts-expect-error — saveDraft is declared POST /admin/posts/save-draft
      saveDraft: adminPagesRouter.saveDraft,
      // @ts-expect-error — publishLatest is declared POST /admin/posts/publish-latest
      publishLatest: adminPagesRouter.publishLatest,
    }
    void pagesIntoPosts
  })
})
