import { readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const UI_ROOT = 'packages/web/admin/src/ui'

describe('workspace structure conventions', () => {
  it('lets a settings section directory own its view or form file', () => {
    const root = `${UI_ROOT}/settings`
    expect(statSync(`${root}/cache/CacheView.tsx`).isFile()).toBe(true)
    expect(statSync(`${root}/rate-limit/ThresholdForm.tsx`).isFile()).toBe(true)
    expect(statSync(`${root}/backup/BackupView.tsx`).isFile()).toBe(true)
    expect(statSync(`${root}/mail/MailForm.tsx`).isFile()).toBe(true)
  })

  it('keeps the canonical admin UI domain directories', () => {
    const actual = readdirSync(UI_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    const expected = [
      'account',
      'analytics',
      'audit',
      'auth',
      'branding',
      'categories',
      'comments',
      'dashboard',
      'editor',
      'editor-meta',
      'editor-shell',
      'fonts',
      'friends',
      'images',
      'jobs',
      'music',
      'pages',
      'posts',
      'sessions',
      'settings',
      'shared',
      'shell',
      'styles',
      'tags',
      'users',
      'webmentions',
    ]
    expect(
      actual,
      'a new admin domain directory joins this table with its API/server counterpart (styles/ holds the ui style adapters)',
    ).toEqual(expected)
  })

  it('contains no doubled directory segment under the ui tree', () => {
    const offenders: string[] = []
    const visit = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue
        }
        const full = `${dir}/${entry.name}`
        const segments = full.split('/')
        for (let i = 1; i < segments.length; i += 1) {
          if (segments[i] === segments[i - 1]) {
            offenders.push(full)
            break
          }
        }
        visit(full)
      }
    }
    visit(UI_ROOT)
    expect(offenders, 'a directory must not be nested inside itself (transforms/transforms)').toEqual([])
  })
})
