import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { TASK_CATALOG } from '@/shared/contracts/jobs'

// Catalog pin: every task registered on the scheduler chain (or written
// manually via startJobRun) must exist in TASK_CATALOG, and every catalog
// entry must have a registration site — adding a task without catalog
// metadata (or vice versa) fails here.

const SRC_SERVER = new URL('../../../../src/server', import.meta.url).pathname

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && full.endsWith('.ts')) {
      out.push(full)
    }
  }
}

function collectTaskKeys(): Map<string, string[]> {
  const files: string[] = []
  walk(SRC_SERVER, files)
  const sites = new Map<string, string[]>()
  const patterns = [/\btask:\s*\{\s*key:\s*'([^']+)'/g, /\bstartJobRun\(\s*'([^']+)'/g]
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const key = match[1]!
        const list = sites.get(key) ?? []
        list.push(file)
        sites.set(key, list)
      }
    }
  }
  return sites
}

describe('task catalog pin', () => {
  const sites = collectTaskKeys()
  const catalogKeys = new Set(TASK_CATALOG.map((task) => task.key))

  it('every registered task key exists in TASK_CATALOG', () => {
    for (const [key, files] of sites) {
      expect(catalogKeys.has(key), `${key} registered in ${files.join(', ')} but missing from TASK_CATALOG`).toBe(true)
    }
  })

  it('every TASK_CATALOG entry has a registration site', () => {
    for (const task of TASK_CATALOG) {
      expect(sites.has(task.key), `${task.key} is in TASK_CATALOG but never registered`).toBe(true)
    }
  })
})
