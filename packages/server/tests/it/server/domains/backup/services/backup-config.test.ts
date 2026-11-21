import { createBackup } from '@kobato/server/domains/backup/services/backup'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { extractBackupFile, unpackTar } from '@kobato/server/tests/utils/backup-buffer'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG_CONTENTS = '{\n  "server": { "port": 4321 }\n}\n'

const mem = makeMemoryBackend()
const db = getTestDb()

let configDir: string
let configPath: string

beforeAll(() => {
  configDir = mkdtempSync(join(tmpdir(), 'kobato-backup-config-test-'))
  configPath = join(configDir, 'kobato.config.json')
  writeFileSync(configPath, CONFIG_CONTENTS)
})

beforeEach(() => {
  vi.stubEnv('KOBATO_CONFIG_FILE', configPath)
})

afterAll(() => {
  rmSync(configDir, { recursive: true, force: true })
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
    vi.stubEnv('KOBATO_CONFIG_FILE', join(configDir, 'missing.json'))
    __setStorageBackendForTests('s3', mem.backend)

    const result = await createBackup(db)

    const stored = mem.store.get(`backup/${result.fileName}`)
    expect(stored).toBeDefined()
    const entries = unpackTar(extractBackupFile(stored!.body))
    expect(entries.map((entry) => entry.name)).toEqual(['kobato.db'])
  })
})
