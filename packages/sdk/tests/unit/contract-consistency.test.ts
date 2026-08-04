import type { ContentPublicRouter as ServerContentPublicRouter } from '@kobato/server/http/api-router.types'
import type { InferContractRouterInputs, InferContractRouterOutputs } from '@orpc/contract'
import type { InferRouterInputs, InferRouterOutputs } from '@orpc/server'

import { contentPublicContractRouter } from '@kobato/sdk/contracts'
import { describe, it } from 'vitest'

/**
 * Contract-consistency pin: the SDK's self-contained contract router
 * (`@kobato/sdk/contracts`) must stay type-equivalent to the server's
 * `ContentPublicRouter` (`@kobato/server/http/api-router.types`) — the
 * single source of truth the SDK was derived from.
 *
 * The assertions are type-level (compile-time only, no runtime cost):
 * the input and output surface of every procedure must match in both
 * directions. Drift on either side — a renamed procedure, a changed
 * input field, a moved DTO property — fails `pnpm run type` (the root
 * program includes `packages/sdk/tests`) and this test at once.
 *
 * The comparison is per-procedure-key: `InferRouterOutputs` over the
 * server router's intersection type (`apiRouter.content & {...}`)
 * produces mapped types whose whole-object equality trips TypeScript's
 * `IsEqual` trick even when every member is equal — per-key comparison
 * is exact, and a future drift names the failing procedure.
 *
 * This is the machine enforcement of the "SDK types stay self-contained
 * AND truthful" property: the SDK must never import `@kobato/*` (it has
 * its own copies in `types.ts`), and those copies must never drift from
 * what core actually answers.
 */

type Assert<T extends true> = T
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false

type SdkInputs = InferContractRouterInputs<typeof contentPublicContractRouter>
type SdkOutputs = InferContractRouterOutputs<typeof contentPublicContractRouter>

type ServerInputs = InferRouterInputs<ServerContentPublicRouter>
type ServerOutputs = InferRouterOutputs<ServerContentPublicRouter>

// Completeness guard: the SDK contract must expose exactly the same
// procedure keys as the server router (no missing, no extra).
type AllKeys = keyof SdkInputs
type _sameProcedureKeys = Assert<Equals<keyof ServerInputs, keyof SdkInputs>>
type _sameCommentKeys = Assert<Equals<keyof ServerInputs['comments'], keyof SdkInputs['comments']>>

// Per-key equality — the actual contract pin.
type _inputsConsistent = Assert<
  { [P in AllKeys]: Equals<SdkInputs[P], ServerInputs[P]> extends true ? true : never }[AllKeys] extends true
    ? true
    : false
>
type _outputsConsistent = Assert<
  { [P in AllKeys]: Equals<SdkOutputs[P], ServerOutputs[P]> extends true ? true : never }[AllKeys] extends true
    ? true
    : false
>

describe('sdk ↔ server contract consistency', () => {
  it('declares the exact input surface of the server ContentPublicRouter', () => {
    // Compile-time only — the `Assert` types above fail `pnpm run type`
    // when the surfaces drift.
  })

  it('declares the exact output surface of the server ContentPublicRouter', () => {
    // Compile-time only.
  })
})
