import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
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

export interface ProcedureRoute<M extends HTTPMethod = HTTPMethod, P extends HTTPPath = HTTPPath> {
  method: M
  path: P
}

export type ProcedureRouteOf<T> = T extends {
  '~orpc': { route: { method: infer M extends HTTPMethod; path: infer P extends HTTPPath } }
}
  ? ProcedureRoute<M, P>
  : unknown

export interface RpcProcedureMeta extends Meta {
  readonly publicRead?: true
  readonly csrfExempt?: true
  readonly requestTimeoutMs?: number
  readonly requestBodyLimit?: {
    readonly maxBytes: number
    readonly messageKey: UiMessageId
    readonly formatMaxBytes?: boolean
  }
  readonly installGateExempt?: true
  readonly telemetryExcluded?: true
}

type OcBase = ReturnType<typeof oc.route>
type NoSchema = Schema<unknown, unknown>
type NoErrors = OcBase['~orpc']['errorMap']

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

export function defineProcedure<const M extends HTTPMethod, const P extends HTTPPath>(route: {
  method: M
  path: P
}): ProcedureDefinition<M, P>
export function defineProcedure<
  const M extends HTTPMethod,
  const P extends HTTPPath,
  const TMeta extends RpcProcedureMeta,
>(route: { method: M; path: P }, options: TMeta): ProcedureDefinition<M, P, TMeta>
export function defineProcedure<const M extends HTTPMethod, const P extends HTTPPath>(
  route: { method: M; path: P },
  options?: RpcProcedureMeta,
): ProcedureDefinition<M, P, RpcProcedureMeta> {
  if (
    options?.requestTimeoutMs !== undefined &&
    (!Number.isInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0)
  ) {
    throw new RangeError('requestTimeoutMs must be a positive integer')
  }
  if (
    options?.requestBodyLimit !== undefined &&
    (!Number.isInteger(options.requestBodyLimit.maxBytes) || options.requestBodyLimit.maxBytes <= 0)
  ) {
    throw new RangeError('requestBodyLimit.maxBytes must be a positive integer')
  }
  const builder = options === undefined ? oc.route(route) : oc.$meta(options).route(route)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return builder as ProcedureDefinition<M, P, RpcProcedureMeta>
}
