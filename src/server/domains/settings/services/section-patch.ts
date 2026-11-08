import { z } from 'zod'

import type { SettingsSection } from '@/shared/config/sections'
import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'

import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { DomainError } from '@/server/infra/http/errors'

/**
 * The one "settings payload rejected" descriptor. Static (no runtime
 * translation at import): the transports localize it per request from the
 * typed key, while `fallbackMessage` stays the English/log text.
 */
export const INVALID_SETTINGS_DESCRIPTOR = {
  messageKey: 'admin.settings.errors.invalid',
  fallbackMessage: 'The settings data is invalid',
} as const satisfies ErrorMessageDescriptor

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Unwrap transparent schema layers (default / optional / pipe…) until a plain object
// appears; anything else is a leaf — arrays replace wholesale, so their shapes are never walked.
function objectShape(schema: z.core.$ZodType): Record<string, z.core.$ZodType> | null {
  let current = schema
  for (;;) {
    if (current instanceof z.ZodObject) {
      return current.shape
    }
    if (
      current instanceof z.ZodDefault ||
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodReadonly
    ) {
      current = current._zod.def.innerType
      continue
    }
    if (current instanceof z.ZodPipe) {
      current = current._zod.def.out
      continue
    }
    return null
  }
}

function collectUnknownKeys(
  schema: z.core.$ZodType,
  payload: Record<string, unknown>,
  path: string[],
  issues: { key: string; path: string[] }[],
): void {
  const shape = objectShape(schema)
  if (shape === null) {
    return
  }
  for (const key of Object.keys(payload)) {
    const fieldSchema = shape[key]
    if (fieldSchema === undefined) {
      issues.push({ key, path: [...path, key] })
      continue
    }
    const value = payload[key]
    if (isRecord(value)) {
      collectUnknownKeys(fieldSchema, value, [...path, key], issues)
    }
  }
}

/**
 * Strict key check: every payload key must exist in the section schema's
 * unwrapped shapes; unknown keys reject with `BAD_REQUEST` before any merge or
 * validation runs. One issue per offending key preserves its field path; the
 * `unrecognizedKeys` descriptor lists every offending key in `params.keys`
 * (and in the English fallback), so neither a raw id nor an empty field name
 * reaches the client.
 */
export function assertSectionPatchKeys(
  section: SettingsSection,
  payload: unknown,
): asserts payload is Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new DomainError('BAD_REQUEST', INVALID_SETTINGS_DESCRIPTOR, [
      {
        messageKey: 'admin.settings.errors.expectedObject',
        fallbackMessage: 'The settings patch must be an object.',
        code: 'invalid_type',
        path: [],
      },
    ])
  }

  const unknown: { key: string; path: string[] }[] = []
  collectUnknownKeys(SECTION_REGISTRY[section].schema, payload, [], unknown)
  if (unknown.length === 0) {
    return
  }

  // Sorted so the list is stable regardless of the payload's key order.
  const keyList = [...new Set(unknown.map((entry) => entry.key))].sort().join(', ')
  const fallbackMessage = `Unrecognized keys: ${keyList}`
  throw new DomainError(
    'BAD_REQUEST',
    INVALID_SETTINGS_DESCRIPTOR,
    unknown.map((entry) => ({
      messageKey: 'admin.settings.errors.unrecognizedKeys',
      params: { keys: keyList },
      fallbackMessage,
      code: 'unrecognized_keys',
      path: entry.path,
    })),
  )
}
