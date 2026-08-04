import type { SettingsSection } from '@kobato/shared/config/sections'

import { SECTION_REGISTRY } from '@kobato/server/domains/settings/sections/registry'
import { DomainError } from '@kobato/server/infra/http/errors'
import { z } from 'zod'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Section schemas wrap nested objects in transparent layers —
// `cors: z.object({...}).default({...})`, optional secrets, pipes such as
// `coerceBoolean`. Unwrap those layers until a plain object appears;
// anything else is a leaf whose VALUE the post-merge validation owns
// (arrays replace wholesale, so their element shapes are never walked).
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
  issues: { message: string; path: string[] }[],
): void {
  const shape = objectShape(schema)
  if (shape === null) {
    return
  }
  for (const key of Object.keys(payload)) {
    const fieldSchema = shape[key]
    if (fieldSchema === undefined) {
      issues.push({ path: [...path, key], message: `Unrecognized key: "${key}"` })
      continue
    }
    const value = payload[key]
    if (isRecord(value)) {
      collectUnknownKeys(fieldSchema, value, [...path, key], issues)
    }
  }
}

/**
 * Strict key check for an incoming Section patch: every key in the
 * payload must exist in the section schema's (unwrapped) object shapes.
 * Unknown keys — loader mask fields, renamed keys, sibling buckets a card
 * does not own — reject with `DomainError BAD_REQUEST` carrying the issue
 * list, before any merge or validation runs. Key legality only; the
 * merged row's VALUES are validated against the full schema afterwards.
 * The assertion signature types a passing payload as the record the merge
 * step consumes.
 */
export function assertSectionPatchKeys(
  section: SettingsSection,
  payload: unknown,
): asserts payload is Record<string, unknown> {
  const issues: { message: string; path: string[] }[] = []
  if (!isRecord(payload)) {
    issues.push({ path: [], message: 'Expected an object' })
  } else {
    collectUnknownKeys(SECTION_REGISTRY[section].schema, payload, [], issues)
  }
  if (issues.length > 0) {
    throw new DomainError('BAD_REQUEST', '设置数据无效', issues)
  }
}
