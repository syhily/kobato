import type { ProcedureRoute, ProcedureRouteOf } from '@kobato/api/rpc/define-procedure'
import type {
  AnyContractRouter,
  AnySchema,
  ContractProcedure,
  ErrorMap,
  HTTPMethod,
  HTTPPath,
  InferContractRouterErrorMap,
  InferContractRouterMeta,
  InferSchemaInput,
  InferSchemaOutput,
  Meta,
} from '@orpc/contract'
import type {
  AnyMiddleware,
  Context,
  ImplementedProcedure,
  IntersectPick,
  MapInputMiddleware,
  MergedCurrentContext,
  MergedInitialContext,
  Middleware,
  ORPCErrorConstructorMap,
  Procedure,
  ProcedureHandler,
  ProcedureImplementer,
  RouterImplementer,
} from '@orpc/server'

import { implementerInternal } from '@orpc/server'

type RouteBrand<Route> = { '~orpc': { route: Route } }

declare const defineProcedureRequired: unique symbol

/**
 * What an unbranded contract leaf (declared with `oc.route` instead of `defineProcedure`) demands from an
 * implementation. No procedure can carry this symbol, so such a leaf fails closed: neither `impl.router()` nor the
 * `apiRouter satisfies` accepts it, which is what stops a new endpoint from slipping past the method/path check.
 */
export interface UnbrandedContractRoute {
  readonly [defineProcedureRequired]: 'declare this procedure with defineProcedure from @kobato/api/rpc/define-procedure'
}

type RouteBrandOf<T> =
  ProcedureRouteOf<T> extends ProcedureRoute<infer M, infer P>
    ? RouteBrand<ProcedureRoute<M, P>>
    : UnbrandedContractRoute

/**
 * A procedure implementer whose `.handler()` result keeps the contract route brand, so `impl.router()` can require it.
 * `use` is re-declared only to carry the brand (and the merged contexts) through the chain.
 */
export interface ContractProcedureImplementer<
  TMethod extends HTTPMethod,
  TPath extends HTTPPath,
  TInitialContext extends Context,
  TCurrentContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
  TMeta extends Meta,
> extends ProcedureImplementer<TInitialContext, TCurrentContext, TInputSchema, TOutputSchema, TErrorMap, TMeta> {
  use<UOutContext extends IntersectPick<TCurrentContext, UOutContext>, UInContext extends Context = TCurrentContext>(
    middleware: Middleware<
      UInContext | TCurrentContext,
      UOutContext,
      InferSchemaOutput<TInputSchema>,
      InferSchemaInput<TOutputSchema>,
      ORPCErrorConstructorMap<TErrorMap>,
      TMeta
    >,
  ): ContractProcedureImplementer<
    TMethod,
    TPath,
    MergedInitialContext<TInitialContext, UInContext, TCurrentContext>,
    MergedCurrentContext<TCurrentContext, UOutContext>,
    TInputSchema,
    TOutputSchema,
    TErrorMap,
    TMeta
  >
  use<
    UOutContext extends IntersectPick<TCurrentContext, UOutContext>,
    UInput,
    UInContext extends Context = TCurrentContext,
  >(
    middleware: Middleware<
      UInContext | TCurrentContext,
      UOutContext,
      UInput,
      InferSchemaInput<TOutputSchema>,
      ORPCErrorConstructorMap<TErrorMap>,
      TMeta
    >,
    mapInput: MapInputMiddleware<InferSchemaOutput<TInputSchema>, UInput>,
  ): ContractProcedureImplementer<
    TMethod,
    TPath,
    MergedInitialContext<TInitialContext, UInContext, TCurrentContext>,
    MergedCurrentContext<TCurrentContext, UOutContext>,
    TInputSchema,
    TOutputSchema,
    TErrorMap,
    TMeta
  >
  handler(
    handler: ProcedureHandler<
      TCurrentContext,
      InferSchemaOutput<TInputSchema>,
      InferSchemaInput<TOutputSchema>,
      TErrorMap,
      TMeta
    >,
  ): ImplementedProcedure<TInitialContext, TCurrentContext, TInputSchema, TOutputSchema, TErrorMap, TMeta> &
    RouteBrand<ProcedureRoute<TMethod, TPath>>
}

/**
 * The router an `impl.router(...)` call returns: oRPC rebuilds every leaf as a plain `Procedure` with the same `~orpc`,
 * so the leaf type is the merged-context procedure plus the route brand the handler attached.
 */
export type ImplementedRouter<U, TInitialContext extends Context, TCurrentContext extends Context> =
  U extends Procedure<
    infer UInitialContext,
    infer UCurrentContext,
    infer TInputSchema extends AnySchema,
    infer TOutputSchema extends AnySchema,
    infer TErrorMap extends ErrorMap,
    infer TMeta extends Meta
  >
    ? Procedure<
        MergedInitialContext<TInitialContext, UInitialContext, TCurrentContext>,
        UCurrentContext,
        TInputSchema,
        TOutputSchema,
        TErrorMap,
        TMeta
      > &
        RouteBrandOf<U>
    : { [K in keyof U]: ImplementedRouter<U[K], TInitialContext, TCurrentContext> }

/**
 * The shape a server router must have to implement `T`: every contract key, each leaf a `Procedure` over the same
 * schemas carrying the contract's route brand. Every production contract is declared with `defineProcedure`, so every
 * leaf is branded; an `oc.route` leaf instead demands `UnbrandedContractRoute` and nothing satisfies it — this is what
 * `apiRouter satisfies ContractImplementation<typeof apiContract>` checks, fail closed.
 */
export type ContractImplementation<T extends AnyContractRouter, TInitialContext extends Context = any> =
  T extends ContractProcedure<
    infer TInputSchema extends AnySchema,
    infer TOutputSchema extends AnySchema,
    infer TErrorMap extends ErrorMap,
    infer TMeta extends Meta
  >
    ? Procedure<TInitialContext, any, TInputSchema, TOutputSchema, TErrorMap, TMeta> & RouteBrandOf<T>
    : { [K in keyof T]: T[K] extends AnyContractRouter ? ContractImplementation<T[K], TInitialContext> : never }

type ContractRouterImplementer<
  T extends AnyContractRouter,
  TInitialContext extends Context,
  TCurrentContext extends Context,
> = Omit<RouterImplementer<T, TInitialContext, TCurrentContext>, 'lazy' | 'router' | 'use'> & {
  use<UOutContext extends IntersectPick<TCurrentContext, UOutContext>, UInContext extends Context = TCurrentContext>(
    middleware: Middleware<
      UInContext | TCurrentContext,
      UOutContext,
      unknown,
      unknown,
      ORPCErrorConstructorMap<InferContractRouterErrorMap<T>>,
      InferContractRouterMeta<T>
    >,
  ): ContractImplementer<
    T,
    MergedInitialContext<TInitialContext, UInContext, TCurrentContext>,
    MergedCurrentContext<TCurrentContext, UOutContext>
  >
  router<U extends ContractImplementation<T, TInitialContext>>(
    router: U,
  ): ImplementedRouter<U, TInitialContext, TCurrentContext>
}

/**
 * The implementer tree for a contract: branded leaves get `ContractProcedureImplementer`, unbranded ones keep oRPC's
 * plain `ProcedureImplementer` (their handlers still type-check, but the result carries no brand and is rejected by
 * `router()`), and router nodes keep oRPC's `use`/`router` with contract-derived constraints.
 */
export type ContractImplementer<
  T extends AnyContractRouter,
  TInitialContext extends Context,
  TCurrentContext extends Context,
> =
  T extends ContractProcedure<
    infer TInputSchema extends AnySchema,
    infer TOutputSchema extends AnySchema,
    infer TErrorMap extends ErrorMap,
    infer TMeta extends Meta
  >
    ? ProcedureRouteOf<T> extends ProcedureRoute<infer TMethod, infer TPath>
      ? ContractProcedureImplementer<
          TMethod,
          TPath,
          TInitialContext,
          TCurrentContext,
          TInputSchema,
          TOutputSchema,
          TErrorMap,
          TMeta
        >
      : ProcedureImplementer<TInitialContext, TCurrentContext, TInputSchema, TOutputSchema, TErrorMap, TMeta>
    : ContractRouterImplementer<T, TInitialContext, TCurrentContext> & {
        [K in keyof T]: T[K] extends AnyContractRouter
          ? ContractImplementer<T[K], TInitialContext, TCurrentContext>
          : never
      }

/**
 * `implementerInternal` typed as a `ContractImplementer`. This holds the ONE assertion behind the contract-derived
 * types: at runtime every leaf Builder copies the contract procedure's `~orpc` (route included), `.handler()` spreads it
 * into the DecoratedProcedure, and `impl.router()` rebuilds each leaf with that same route — the route/schema identity
 * parity tests (`api-contract`, `likes-contract`) pin each step.
 */
export function contractImplementer<
  T extends AnyContractRouter,
  TInitialContext extends Context,
  TCurrentContext extends Context,
>(contract: T, middlewares: readonly AnyMiddleware[]): ContractImplementer<T, TInitialContext, TCurrentContext> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the ONE implementer assertion; runtime route/schema parity is pinned by api-contract.test.ts and likes-contract.test.ts
  return implementerInternal(contract, {}, [...middlewares]) as unknown as ContractImplementer<
    T,
    TInitialContext,
    TCurrentContext
  >
}
