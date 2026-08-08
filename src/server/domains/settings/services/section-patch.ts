import { z } from 'zod'

import type { SettingsSection } from '@/shared/config/sections'

import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { DomainError } from '@/server/infra/http/errors'

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
 * Strict key check: every payload key must exist in the section schema's unwrapped shapes;
 * unknown keys reject with `BAD_REQUEST` (issue list) before any merge or validation runs.
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
