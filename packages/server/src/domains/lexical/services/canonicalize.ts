import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { DomainError } from '@kobato/server/infra/http/errors'
import { prerenderLexicalBody } from '@kobato/server/infra/lexical/prerender'
import { validatePortableTextBody } from '@kobato/shared/legacy-pt/utils'
import { canonicalizeLexicalBodyShape } from '@kobato/shared/lexical/canonicalize'
import { convertPtBodyToLexical } from '@kobato/shared/lexical/mapping'
import { visitLexicalNodes } from '@kobato/shared/lexical/walk'

// Server-side canonicalization for Lexical post/page bodies — the
// Lexical replacement of `canonicalizePortableTextBody`
// (`@kobato/server/domains/pt/services/canonicalize`):
//
//   1. `canonicalizeLexicalBodyShape` — quote normalization, autolink →
//      link rewrite, the zod gate + headless parse double check,
//      footnote index sync, and the deterministic 0.45.0 serialized form
//   2. strip any client-supplied pre-rendered fields (mathml / svg /
//      highlightedHtml) to prevent stored XSS and stale artifacts — the
//      server re-pre-renders from tex/code below (same policy as the PT
//      path)
//   3. `prerenderLexicalBody` — Shiki for `code`, KaTeX for `mathBlock`
//      and `mathInline`
//
// On any validation failure, surface a `DomainError` so the resource
// route can translate it into a structured `ActionFailure` response.

export async function canonicalizeLexicalBody(input: unknown): Promise<LexicalBody> {
  try {
    // DUAL-SHAPE input until the migration lands (R6): the wire keeps the
    // PT shape while the admin editor is still Tiptap (R5b), so a PT
    // array converts through the one-way mapping before canonicalizing.
    const body = canonicalizeLexicalBodyShape(
      Array.isArray(input) ? convertPtBodyToLexical(validatePortableTextBody(input)) : input,
    )
    stripClientPrerenderedFields(body)
    await prerenderLexicalBody(body)
    return body
  } catch (error) {
    throw new DomainError('BAD_REQUEST', '正文格式不合法。', extractZodIssues(error))
  }
}

function stripClientPrerenderedFields(body: LexicalBody): void {
  visitLexicalNodes(body, (node) => {
    if (node.type === 'code') {
      delete node.highlightedHtml
      return
    }
    if (node.type === 'mathBlock' || node.type === 'mathInline') {
      delete node.mathml
      delete node.svg
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
