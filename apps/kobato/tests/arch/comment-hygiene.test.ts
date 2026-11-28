import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const SCAN_ROOTS = ['apps', 'packages', 'shared', 'tools']

const EXEMPT_PREFIXES = [
  'packages/inkling/src/nodes/base/',
  'packages/inkling/src/utils/draggable/',
  'packages/server/src/domains/fonts/vendor/',
  'packages/db/drizzle/',
  'apps/kobato/.react-router/',
]

const IGNORE_DIRS = new Set(['node_modules', '.git', 'build', 'dist', 'dist-sea', '.vite', 'coverage'])

const BANNED_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bmoved (from|here|into|out of)\b/i, label: 'moved-from narration' },
  { pattern: /\bformerly\b/i, label: '"formerly"' },
  { pattern: /\bused to be\b/i, label: '"used to be"' },
  { pattern: /\bpre-split\b/i, label: '"pre-split"' },
  { pattern: /\bthe former\b/i, label: '"the former"' },
  { pattern: /\brenamed (from|to)\b/i, label: 'rename narration' },
  { pattern: /\bwas previously\b/i, label: '"was previously"' },
  { pattern: /\bno longer (is|are|was|were)\b/i, label: 'past-state narration' },
]

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
}

function commentSpans(source: string): string[] {
  const spans: string[] = []
  let i = 0
  const n = source.length
  while (i < n) {
    const ch = source[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      i += 1
      while (i < n) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === quote) {
          i += 1
          break
        }
        i += 1
      }
      continue
    }
    if (ch === '/' && source[i + 1] === '/') {
      const start = i
      while (i < n && source[i] !== '\n') {
        i += 1
      }
      spans.push(source.slice(start, i))
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const start = i
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        i += 1
      }
      i = Math.min(i + 2, n)
      spans.push(source.slice(start, i))
      continue
    }
    i += 1
  }
  return spans
}

describe('comment hygiene', () => {
  it('carries no history narration in comments', () => {
    const files: string[] = []
    for (const root of SCAN_ROOTS) {
      walk(`${REPO_ROOT}/${root}`, files)
    }
    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(REPO_ROOT, file)
      if (EXEMPT_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
        continue
      }
      for (const span of commentSpans(readFileSync(file, 'utf8'))) {
        for (const { pattern, label } of BANNED_PATTERNS) {
          if (pattern.test(span)) {
            offenders.push(`${rel}: [${label}] ${span.replace(/\s+/g, ' ').slice(0, 120)}`)
            break
          }
        }
      }
    }
    expect(
      offenders,
      'a comment must describe the present, never a past state of the tree — see the Comments section of AGENTS.md',
    ).toEqual([])
  })
})
