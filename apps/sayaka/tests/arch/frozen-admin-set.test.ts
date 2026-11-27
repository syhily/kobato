import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const FROZEN_ADMIN_PROCEDURES = [
  'admin.comments.approve',
  'admin.comments.delete',
  'admin.comments.edit',
  'admin.notifications.recall',
  'admin.notifications.sendBroadcast',
  'admin.notifications.sendDirect',
  'admin.users.list',
] as const

const FROZEN_ADMIN_DOMAINS = new Set(['comments', 'notifications', 'users'])

const PROCEDURE_BUILDERS = new Set(['queryOptions', 'mutationOptions', 'infiniteOptions'])

const SCAN_ROOTS = ['apps/sayaka/src', 'packages/web/kit/src', 'packages/api/src/browser'] as const

const ADMIN_TOUCH = /\borpc(?:Query)?\.admin\.([A-Za-z]\w*)\.([A-Za-z]\w*)(?:\.([A-Za-z]\w*))?/g

function sourceFiles(root: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, root), { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(full, out)
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(full)
    }
  }
  return out
}

interface AdminTouch {
  file: string
  domain: string
  procedure: string
  tail: string | undefined
}

function adminTouches(file: string, content: string): AdminTouch[] {
  return [...content.matchAll(ADMIN_TOUCH)].map((match) => ({
    file,
    domain: match[1]!,
    procedure: `admin.${match[1]}.${match[2]}`,
    tail: match[3],
  }))
}

describe('frozen first-party admin set (ADR-0009 §2)', () => {
  const files = SCAN_ROOTS.flatMap((root) => sourceFiles(root))
  const touches = files.flatMap((file) => adminTouches(file, readFileSync(join(REPO_ROOT, file), 'utf8')))

  it('scans both first-party public surfaces and the api browser hooks they import', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const root of SCAN_ROOTS) {
      expect(
        files.some((file) => file.startsWith(root)),
        root,
      ).toBe(true)
    }
  })

  it('touches exactly the frozen admin procedures — no more, no fewer', () => {
    const referenced = [
      ...new Set(touches.filter((touch) => PROCEDURE_BUILDERS.has(touch.tail ?? '')).map((touch) => touch.procedure)),
    ].sort()
    expect(referenced).toEqual([...FROZEN_ADMIN_PROCEDURES].sort())
  })

  it('shapes every admin touch as a frozen procedure call or a frozen-domain query key', () => {
    const offenders = touches.filter((touch) => {
      if (PROCEDURE_BUILDERS.has(touch.tail ?? '')) {
        return !(FROZEN_ADMIN_PROCEDURES as readonly string[]).includes(touch.procedure)
      }
      if (touch.tail === undefined || touch.tail === 'key') {
        return !FROZEN_ADMIN_DOMAINS.has(touch.domain)
      }
      return true
    })
    expect(offenders).toEqual([])
  })
})
