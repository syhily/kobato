import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { z } from 'zod'

export const idString = z.string().regex(/^\d+$/, 'numeric id required')
export const isoDateTime = z.iso.datetime()

export function safeBoolean() {
  return z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : v))
}

export const successDto = z.object({ success: z.boolean() })
export type SuccessOutput = z.infer<typeof successDto>

export const resourceRepresentationSchema = z.object({
  contentType: z.string(),
  cacheControl: z.string(),
  contentLanguage: z.string().nullable(),
})
export type ResourceRepresentation = z.infer<typeof resourceRepresentationSchema>

export const resourceOkSchema = resourceRepresentationSchema.extend({
  kind: z.literal('ok'),
  body: z.string(),
  etag: z.string(),
})
export type ResourceOk = z.infer<typeof resourceOkSchema>

export const resourceNotModifiedSchema = resourceRepresentationSchema.extend({
  kind: z.literal('not-modified'),
  etag: z.string(),
})
export type ResourceNotModified = z.infer<typeof resourceNotModifiedSchema>

export const resourceBinaryOkSchema = resourceRepresentationSchema.extend({
  kind: z.literal('ok'),
  body: z.instanceof(Blob),
  etag: z.string().optional(),
})
export type ResourceBinaryOk = z.infer<typeof resourceBinaryOkSchema>

export const resourceRedirectSchema = z.object({
  kind: z.literal('redirect'),
  location: z.string(),
  cacheControl: z.string().nullable(),
})
export type ResourceRedirect = z.infer<typeof resourceRedirectSchema>

export const rangeNotSatisfiableSchema = resourceRepresentationSchema.extend({
  kind: z.literal('range-not-satisfiable'),
  etag: z.string(),
  contentRange: z.string(),
})
export type RangeNotSatisfiable = z.infer<typeof rangeNotSatisfiableSchema>

export const streamOutputSchema = z.custom<ReadableStream<Uint8Array>>((value) => value instanceof ReadableStream)
export type StreamOutput = z.infer<typeof streamOutputSchema>

export const mediaResourceOutputSchema = z.union([
  resourceNotModifiedSchema,
  resourceRedirectSchema,
  rangeNotSatisfiableSchema,
  streamOutputSchema,
])
export type MediaResourceOutput = z.infer<typeof mediaResourceOutputSchema>

export const resourceOutputSchema = z.union([resourceNotModifiedSchema, resourceOkSchema])
export type ResourceOutput = z.infer<typeof resourceOutputSchema>

export const okDto = z.object({ ok: z.literal(true) })
export type OkOutput = z.infer<typeof okDto>

export const voidOutput = z.void()

export const fileSchema = z
  .instanceof(Blob)
  .refine((value): value is File => 'name' in value && typeof value.name === 'string')
export type FileWire = z.infer<typeof fileSchema>

export const binaryOutput = z.custom<ReadableStream<Uint8Array> | Blob>(
  (value) => value instanceof ReadableStream || value instanceof Blob,
)
export type BinaryOutput = z.infer<typeof binaryOutput>

const HONEYPOT_MAX_LENGTH = 240

export function honeypotField<const TName extends string>(name: TName) {
  return {
    schema: z.string().max(HONEYPOT_MAX_LENGTH).optional().default(''),
    refine: (value: Record<TName, string>, ctx: z.RefinementCtx) => {
      if (value[name].trim().length > 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'validation.form.invalidInput',
          path: [name],
        })
      }
    },
  }
}

export type ErrorMessageParams = Record<string, string | number | boolean | null>

export interface ErrorMessageDescriptor {
  messageKey: UiMessageId
  params?: ErrorMessageParams
  fallbackMessage: string
}

export interface ErrorIssueWire extends ErrorMessageDescriptor {
  message: string
  code?: string
  path?: string[]
}

export interface ApiErrorData {
  descriptor: ErrorMessageDescriptor
  issues?: ErrorIssueWire[]
}

export type ZodIssueParamValue = string | number | boolean | null

export type ZodIssueParams = Record<string, ZodIssueParamValue>

function isParamValue(value: unknown): value is ZodIssueParamValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addNumericBounds(issue: object, params: ZodIssueParams): void {
  if ('minimum' in issue && typeof issue.minimum === 'number' && Number.isFinite(issue.minimum)) {
    params.min = issue.minimum
  }
  if ('maximum' in issue && typeof issue.maximum === 'number' && Number.isFinite(issue.maximum)) {
    params.max = issue.maximum
  }
}

export function zodIssueParams(issue: unknown): ZodIssueParams | undefined {
  if (typeof issue !== 'object' || issue === null) {
    return undefined
  }
  const params: ZodIssueParams = {}
  addNumericBounds(issue, params)
  if ('params' in issue && isRecord(issue.params)) {
    for (const [key, value] of Object.entries(issue.params)) {
      if (isParamValue(value)) {
        params[key] = value
      }
    }
  }
  return Object.keys(params).length === 0 ? undefined : params
}

export function mergePatchInput<P extends z.ZodRawShape>(patch: P) {
  if ('id' in patch) {
    throw new Error('mergePatchInput: the patch shape must not declare the identity key "id"')
  }
  return z.object({ id: idString, ...patch })
}

export function clearable<S extends z.ZodType>(schema: S) {
  return z.union([schema, z.null()]).optional()
}

export function splitMergePatch<T extends { id: string }>(
  input: T,
): { id: string; patch: { [K in keyof Omit<T, 'id'>]?: Exclude<Omit<T, 'id'>[K], undefined> } } {
  const { id, ...rest } = input
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      patch[key] = value
    }
  }
  return { id, patch: unsafeCast(patch) }
}
