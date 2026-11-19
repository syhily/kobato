import { createBackup } from '@kobato/server/domains/backup/services/backup.ts'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry.ts'
import { extractBackupFile, unpackTar } from '@kobato/test/backup-buffer.ts'
import { clearAllTables, getTestDb } from '@kobato/test/integration-db.ts'
import { makeMemoryBackend } from '@kobato/test/memory-storage.ts'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const holder = vi.hoisted(() => ({ configPath: null as string | null, configDir: null as string | null }))

vi.mock('@kobato/server/infra/config.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kobato/server/infra/config.ts')>()),
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
