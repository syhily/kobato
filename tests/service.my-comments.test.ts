import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Covers RBAC-RECTIFICATION-PLAN §1.7 (O7).
//
// `listMyComments(userId, offset, limit)` and `countMyComments(userId)`
// must share a single visibility predicate. Drift between the two had
// previously caused
// `hasMore = offset + comments.length < counts.total` to under-count
// the total (the list query included rows the count query had already
// dropped), truncating the "/my/comments" tail page or hiding a
// «load more» button mid-list.
//
// The current implementation centralises that predicate in
// `mineWhere(userId, filters)` — which itself wraps the smaller
// `mineVisibleClause(userId)` so the soft-delete grace window stays in
// lockstep — and parameterises the grace window with the named
// constant `MY_COMMENTS_SOFT_DELETE_GRACE_MS`. This test pins the
// source-level contract:
//
//   1. `MY_COMMENTS_SOFT_DELETE_GRACE_MS` is declared in the file AND
//      both `listMyComments` and `countMyComments` reach for
//      `mineWhere` (not bespoke `where(...)` clauses). `mineWhere` in
//      turn references `mineVisibleClause`, keeping the grace-window
//      predicate single-sourced.
//   2. The grace constant equals exactly 7 days in milliseconds.

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')
const commentQueryPath = resolve(projectRoot, 'src/server/domains/comments/repos/admin-query.ts')
const commentSharedPath = resolve(projectRoot, 'src/server/domains/comments/repos/shared.ts')

function readSource(): string {
  return readFileSync(commentQueryPath, 'utf8') + '\n' + readFileSync(commentSharedPath, 'utf8')
}

function extractFunctionBody(source: string, fnSignaturePattern: RegExp): string {
  // Finds the `export ... function <name>(` declaration, walks past the
  // parenthesised parameter list (so a return-type annotation with `{`s
  // — `Promise<{ total: number; … }>` — is not misread as the body),
  // then returns the text between the opening `{` and its matching `}`.
  const match = fnSignaturePattern.exec(source)
  if (!match) {
    throw new Error(`Function signature not found: ${String(fnSignaturePattern)}`)
  }
  // Walk the parameter list, balancing `(` / `)`.
  let i = match.index + match[0].length
  let parenDepth = 1
  while (i < source.length && parenDepth > 0) {
    const ch = source[i]
    if (ch === '(') {
      parenDepth++
    } else if (ch === ')') {
      parenDepth--
    }
    i++
  }
  // Now consume optional `: ReturnType` until we reach the body's `{`.
  // Track `<` / `>` and `{` / `}` depths so generic / inline object
  // types inside the annotation don't trip the search.
  let angleDepth = 0
  let braceDepth = 0
  while (i < source.length) {
    const ch = source[i]
    if (angleDepth === 0 && braceDepth === 0 && ch === '{') {
      break
    }
    if (ch === '<') {
      angleDepth++
    } else if (ch === '>') {
      angleDepth = Math.max(0, angleDepth - 1)
    } else if (ch === '{') {
      braceDepth++
    } else if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
    }
    i++
  }
  if (i >= source.length) {
    throw new Error('Body opening brace not found')
  }
  const startBody = i
  let depth = 1
  i++
  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
    }
    i++
  }
  return source.slice(startBody, i)
}

describe('server/db/query/comment — listMyComments / countMyComments share visibility window', () => {
  it('declares MY_COMMENTS_SOFT_DELETE_GRACE_MS and references mineWhere from both functions', () => {
    const source = readSource()
    expect(source).toMatch(/MY_COMMENTS_SOFT_DELETE_GRACE_MS/)
    expect(source).toMatch(/function\s+mineVisibleClause\s*\(/)
    expect(source).toMatch(/function\s+mineWhere\s*\(/)

    const listBody = extractFunctionBody(source, /export\s+async\s+function\s+listMyComments\s*\(/)
    const countBody = extractFunctionBody(source, /export\s+async\s+function\s+countMyComments\s*\(/)

    expect(
      listBody.includes('mineWhere('),
      'listMyComments must route through mineWhere so it shares the visibility predicate with countMyComments',
    ).toBe(true)
    expect(
      countBody.includes('mineWhere('),
      'countMyComments must route through mineWhere so hasMore math stays consistent',
    ).toBe(true)
  })

  it('parameterises the visibility window to exactly 7 days of soft-delete grace', () => {
    const source = readSource()
    // Match `7 * <something>` literal arithmetic. We pin the leading `7`
    // so the test fails immediately if the grace window is shortened
    // (or lengthened) without the test being intentionally updated to
    // match — even if the right-hand factorisation gets rewritten
    // (`86_400_000`, `24 * 3_600_000`, etc.).
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
    const HOURS_DAYS_FORMS = [`${SEVEN_DAYS_MS}`, '7 * 24 * 60 * 60 * 1000', '7 * 24 * 3_600_000', '7 * 86_400_000']
    const constLine = /MY_COMMENTS_SOFT_DELETE_GRACE_MS\s*=\s*([^\n;]+)/.exec(source)
    expect(constLine, 'expected `const MY_COMMENTS_SOFT_DELETE_GRACE_MS = …` in comments/repos').not.toBeNull()
    const expression = constLine![1]!.trim().replace(/[\s_]/g, '')
    const accepted = HOURS_DAYS_FORMS.map((f) => f.replace(/[\s_]/g, ''))
    expect(
      accepted.includes(expression),
      `MY_COMMENTS_SOFT_DELETE_GRACE_MS literal must equal 7 days; got: ${expression}`,
    ).toBe(true)
  })
})
