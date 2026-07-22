import type { PortableTextBody } from '@/shared/pt/schema'

import { DomainError } from '@/server/infra/http/errors'
import { prerenderPortableTextBody } from '@/server/infra/pt/prerender'
import { validatePortableTextBody } from '@/shared/pt/utils'

export async function canonicalizePortableTextBody(input: unknown): Promise<PortableTextBody> {
  try {
    const body = validatePortableTextBody(input)
    await prerenderPortableTextBody(body)
    return body
  } catch (error) {
    throw new DomainError('BAD_REQUEST', '正文格式不合法。', extractZodIssues(error))
  }
}

function extractZodIssues(error: unknown): { message: string; path?: string[] }[] | undefined {
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
