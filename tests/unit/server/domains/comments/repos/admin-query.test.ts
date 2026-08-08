import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Covers RBAC-RECTIFICATION-PLAN §1.7 (O7).
// Pins the source contract: both listMyComments and countMyComments route
// through mineWhere → mineVisibleClause; the grace constant is 7 days.

const commentQueryPath = resolve(process.cwd(), 'src/server/domains/comments/repos/admin-query.ts')
const commentSharedPath = resolve(process.cwd(), 'src/server/domains/comments/repos/shared.ts')
const mineCommentsPath = resolve(process.cwd(), 'src/server/domains/comments/services/mine-comments.ts')

function readSource(): string {
  return (
    readFileSync(commentQueryPath, 'utf8') +
    '\n' +
    readFileSync(commentSharedPath, 'utf8') +
    '\n' +
    readFileSync(mineCommentsPath, 'utf8')
  )
}

function extractFunctionBody(source: string, fnSignaturePattern: RegExp): string {
  // Skips the parameter list and return-type annotation to find the body's braces.
  const match = fnSignaturePattern.exec(source)
  if (!match) {
    throw new Error(`Function signature not found: ${String(fnSignaturePattern)}`)
  }
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
  // Consume optional `: ReturnType`, tracking depth so annotations don't trip the search.
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
    // Pin the leading `7` whatever the RHS factorisation is rewritten as.
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
