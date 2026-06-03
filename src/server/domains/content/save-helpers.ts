import type { PortableTextBody } from '@/shared/pt/schema'

import { canonicalizePortableTextBody } from '@/server/domains/pt/services/canonicalize'
import { DomainError } from '@/server/infra/http/errors'

export async function canonicalizeBodyOrThrow(value: unknown): Promise<PortableTextBody> {
  try {
    return await canonicalizePortableTextBody(value)
  } catch (error) {
    throw new DomainError('BAD_REQUEST', '正文格式不合法。', extractZodIssues(error))
  }
}

export function extractZodIssues(error: unknown): { message: string; path?: string[] }[] | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const issues = (error as { issues?: unknown }).issues
  if (!Array.isArray(issues)) {
    return undefined
  }
  return issues
    .filter((issue): issue is { message: string; path?: unknown[] } => typeof issue === 'object' && issue !== null)
    .map((issue) => ({
      message: typeof issue.message === 'string' ? issue.message : 'invalid body',
      path: Array.isArray(issue.path) ? issue.path.map(String) : undefined,
    }))
}
