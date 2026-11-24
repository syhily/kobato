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

export interface UnbrandedContractRoute {
  readonly [defineProcedureRequired]: 'declare this procedure with defineProcedure from @kobato/api/rpc/define-procedure'
}

type RouteBrandOf<T> =
  ProcedureRouteOf<T> extends ProcedureRoute<infer M, infer P>
    ? RouteBrand<ProcedureRoute<M, P>>
    : UnbrandedContractRoute

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

export function contractImplementer<
  T extends AnyContractRouter,
  TInitialContext extends Context,
  TCurrentContext extends Context,
>(contract: T, middlewares: readonly AnyMiddleware[]): ContractImplementer<T, TInitialContext, TCurrentContext> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return implementerInternal(contract, {}, [...middlewares]) as unknown as ContractImplementer<
    T,
    TInitialContext,
    TCurrentContext
  >
}
