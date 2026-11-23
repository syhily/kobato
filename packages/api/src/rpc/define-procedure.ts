import type {
  AnySchema,
  ContractProcedureBuilder,
  ContractProcedureBuilderWithInput,
  ContractProcedureBuilderWithInputOutput,
  ContractProcedureBuilderWithOutput,
  ContractProcedureDef,
  HTTPMethod,
  HTTPPath,
  Meta,
  Route,
  Schema,
} from '@orpc/contract'

import { oc } from '@orpc/contract'

/**
 * The method/path pair a `defineProcedure` route keeps on `~orpc.route` at the type level. oRPC's own
 * `ContractProcedureDef.route` is the wide `Route`, so this brand is what lets the server derive an implementation
 * shape from the contract tree (`@kobato/server/http/contract-implementation`).
 */
export interface ProcedureRoute<M extends HTTPMethod = HTTPMethod, P extends HTTPPath = HTTPPath> {
  method: M
  path: P
}

/**
 * The route brand carried by a procedure-like type, or `unknown` when it was declared without `defineProcedure`.
 */
export type ProcedureRouteOf<T> = T extends {
  '~orpc': { route: { method: infer M extends HTTPMethod; path: infer P extends HTTPPath } }
}
  ? ProcedureRoute<M, P>
  : unknown

/**
 * The transport-visible anonymous-read eligibility marker, carried on the procedure's `~orpc.meta` — oRPC's
 * sanctioned custom-metadata slot, never the route compatibility record. Declared by passing `{ publicRead: true }`
 * to `defineProcedure`; the server derives its frozen CSRF public-read exemption from this flag. Eligibility is an
 * explicit per-procedure opt-in — never inferred from the HTTP method (the RPC transport POSTs reads too).
 */
export interface PublicReadMeta extends Meta {
  readonly publicRead: true
}

const PUBLIC_READ_META: PublicReadMeta = { publicRead: true }

type OcBase = ReturnType<typeof oc.route>
type NoSchema = Schema<unknown, unknown>
type NoErrors = OcBase['~orpc']['errorMap']

/**
 * The empty meta of a procedure declared without any metadata options — what `defineProcedure(route)` carries when no
 * `{ publicRead: true }` opt-in is given. Kept as an oRPC-derived alias so call sites never spell the literal shape.
 */
export type NoMeta = OcBase['~orpc']['meta']

type DefinitionDef<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  M extends HTTPMethod,
  P extends HTTPPath,
  TMeta extends Meta,
> = ContractProcedureDef<TInputSchema, TOutputSchema, NoErrors, TMeta> & {
  route: Omit<Route, 'method' | 'path'> & ProcedureRoute<M, P>
}

export interface ProcedureDefinition<
  M extends HTTPMethod,
  P extends HTTPPath,
  TMeta extends Meta = NoMeta,
> extends ContractProcedureBuilder<NoSchema, NoSchema, NoErrors, TMeta> {
  '~orpc': DefinitionDef<NoSchema, NoSchema, M, P, TMeta>
  input<U extends AnySchema>(schema: U): ProcedureDefinitionWithInput<M, P, TMeta, U>
  output<U extends AnySchema>(schema: U): ProcedureDefinitionWithOutput<M, P, TMeta, U>
}

export interface ProcedureDefinitionWithInput<
  M extends HTTPMethod,
  P extends HTTPPath,
  TMeta extends Meta,
  TInputSchema extends AnySchema,
> extends ContractProcedureBuilderWithInput<TInputSchema, NoSchema, NoErrors, TMeta> {
  '~orpc': DefinitionDef<TInputSchema, NoSchema, M, P, TMeta>
  output<U extends AnySchema>(schema: U): ProcedureDefinitionWithInputOutput<M, P, TMeta, TInputSchema, U>
}

export interface ProcedureDefinitionWithOutput<
  M extends HTTPMethod,
  P extends HTTPPath,
  TMeta extends Meta,
  TOutputSchema extends AnySchema,
> extends ContractProcedureBuilderWithOutput<NoSchema, TOutputSchema, NoErrors, TMeta> {
  '~orpc': DefinitionDef<NoSchema, TOutputSchema, M, P, TMeta>
  input<U extends AnySchema>(schema: U): ProcedureDefinitionWithInputOutput<M, P, TMeta, U, TOutputSchema>
}

export interface ProcedureDefinitionWithInputOutput<
  M extends HTTPMethod,
  P extends HTTPPath,
  TMeta extends Meta,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
> extends ContractProcedureBuilderWithInputOutput<TInputSchema, TOutputSchema, NoErrors, TMeta> {
  '~orpc': DefinitionDef<TInputSchema, TOutputSchema, M, P, TMeta>
}

/**
 * `oc.route` plus a type-level method/path brand: the runtime value is the untouched oRPC contract procedure, but its
 * `~orpc.route` type keeps the declared literals so a server router can be checked against the contract tree.
 * The type parameters are `const` so a path built from a generic base (e.g. `` `${basePath}/save-draft` `` inside a
 * factory) keeps that placeholder instead of widening it to `string` — see `rpc/admin/revision.ts`.
 * Passing `{ publicRead: true }` opts the procedure into anonymous-read eligibility: the flag is written through
 * oRPC's own `$meta`/`route` chain (runtime `~orpc.meta.publicRead === true`, never a fabricated cast) and preserved
 * by every `.input()`/`.output()` link; without the option no `publicRead` metadata exists at all.
 * The single `as` below is backed by the route/schema/meta identity tests in `tests/unit/define-procedure.test.ts`.
 */
export function defineProcedure<const M extends HTTPMethod, const P extends HTTPPath>(route: {
  method: M
  path: P
}): ProcedureDefinition<M, P>
export function defineProcedure<const M extends HTTPMethod, const P extends HTTPPath>(
  route: { method: M; path: P },
  options: { readonly publicRead: true },
): ProcedureDefinition<M, P, PublicReadMeta>
export function defineProcedure<const M extends HTTPMethod, const P extends HTTPPath>(
  route: { method: M; path: P },
  options?: { readonly publicRead?: boolean },
): ProcedureDefinition<M, P> | ProcedureDefinition<M, P, PublicReadMeta> {
  const builder = options?.publicRead === true ? oc.$meta(PUBLIC_READ_META).route(route) : oc.route(route)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the ONE brand assertion; runtime route/schema/meta identity is pinned by tests/unit/define-procedure.test.ts
  return builder as ProcedureDefinition<M, P> | ProcedureDefinition<M, P, PublicReadMeta>
}
