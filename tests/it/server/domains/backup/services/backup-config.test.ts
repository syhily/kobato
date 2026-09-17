import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { extractBackupFile, unpackTar } from '#/_helpers/backup-buffer'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { createBackup } from '@/server/domains/backup/services/backup'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

// A real config file on disk stands in for the env-converged kobato.config.json
// — under VITEST the resolver would otherwise report the env-only null.
const holder = vi.hoisted(() => ({ configPath: null as string | null, configDir: null as string | null }))

vi.mock('@/server/infra/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/infra/config')>()),
  resolveConfigFilePath: () => holder.configPath,
}))

const CONFIG_CONTENTS = '{\n  "server": { "port": 4321 }\n}\n'

const mem = makeMemoryBackend()
const db = getTestDb()

beforeAll(() => {
  holder.configDir = mkdtempSync(join(tmpdir(), 'kobato-backup-config-test-'))
  holder.configPath = join(holder.configDir, 'kobato.config.json')
  writeFileSync(holder.configPath, CONFIG_CONTENTS)
})

afterAll(() => {
  if (holder.configDir !== null) {
    rmSync(holder.configDir, { recursive: true, force: true })
  }
})

afterEach(async () => {
  __resetStorageBackendsForTests()
  mem.reset()
  await clearAllTables(db)
})

describe('createBackup — config file in the archive', () => {
  it('packs the resolved config file as kobato.config.json next to the database', async () => {
    __setStorageBackendForTests('s3', mem.backend)

    const result = await createBackup(db)

    const stored = mem.store.get(`backup/${result.fileName}`)
    expect(stored).toBeDefined()
    // The it env runs the analytics sidecar in-memory, so no duckdb entry.
    const entries = unpackTar(extractBackupFile(stored!.body))
    expect(entries.map((entry) => entry.name)).toEqual(['kobato.db', 'kobato.config.json'])
    const configEntry = entries.find((entry) => entry.name === 'kobato.config.json')!
    expect(configEntry.data.toString('utf-8')).toBe(CONFIG_CONTENTS)
  })

  it('still archives the database when the config file is unreadable', async () => {
    __setStorageBackendForTests('s3', mem.backend)
    const readable = holder.configPath
    holder.configPath = join(holder.configDir!, 'missing.json')
    try {
      const result = await createBackup(db)
      const stored = mem.store.get(`backup/${result.fileName}`)
      const entries = unpackTar(extractBackupFile(stored!.body))
      expect(entries.map((entry) => entry.name)).toEqual(['kobato.db'])
    } finally {
      holder.configPath = readable
    }
  })
})
