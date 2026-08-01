import type { MarkDef, PortableTextBody } from '@/shared/pt/schema'

import { DomainError } from '@/server/infra/http/errors'
import { prerenderPortableTextBody } from '@/server/infra/pt/prerender'
import { validatePortableTextBody, visitNestedBlocks } from '@/shared/pt/utils'

export async function canonicalizePortableTextBody(input: unknown): Promise<PortableTextBody> {
  try {
    const body = validatePortableTextBody(input)
    // Strip any client-supplied pre-rendered fields to prevent stored XSS
    // and stale artifacts (same policy as the comment path) — the prerender
    // pass below only recomputes missing fields, so a kept client value
    // would be stored verbatim, possibly inconsistent with code/tex. Unlike
    // the comment dialect, post/page bodies nest code/math inside solution,
    // twoColumn, and footnoteDefinition containers, so the strip walks the
    // same nested positions `prerenderPortableTextBody` recomputes.
    stripClientPrerenderedFields(body)
    await prerenderPortableTextBody(body)
    return body
  } catch (error) {
    throw new DomainError('BAD_REQUEST', '正文格式不合法。', extractZodIssues(error))
  }
}

function stripClientPrerenderedFields(body: PortableTextBody): void {
  visitNestedBlocks(body, (block) => {
    if (block._type === 'code') {
      block.highlightedHtml = undefined
      return
    }
    if (block._type === 'mathBlock') {
      block.mathml = undefined
      block.svg = undefined
      return
    }
    if (block._type === 'block' && Array.isArray(block.markDefs)) {
      for (const def of block.markDefs as MarkDef[]) {
        if (def._type === 'mathInline') {
          def.mathml = undefined
          def.svg = undefined
        }
      }
    }
  })
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
