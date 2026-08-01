import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CONFIG_TABLE,
  configCandidates,
  configEnvName,
  loadConfig,
  loadServerConfig,
  migrateLegacyKeys,
} from '@/server/infra/config'

// The config loader is exercised with argv/env/FS permutations. Under
// VITEST without --config, loadConfig never touches the filesystem — so
// every test that needs file behavior passes --config (pointed at a temp
// dir). `process.exit` is stubbed to intercept `fail()`.

const tmpDirs: string[] = []
const realArgv = process.argv

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-config-test-'))
  tmpDirs.push(dir)
  return dir
}

function configPathIn(dir: string): string {
  return join(dir, 'kobato.config.json')
}

function withConfigArg(path: string): void {
  process.argv = [realArgv[0]!, realArgv[1]!, '--config', path]
}

function writeConfig(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data))
}

const ENV_KEYS = CONFIG_TABLE.map((entry) => configEnvName(entry.path))

function clearConfigEnv(): void {
  for (const key of ENV_KEYS) {
    vi.stubEnv(key, undefined)
  }
}

describe('infra/config — loadConfig', () => {
  beforeEach(() => {
    clearConfigEnv()
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called')
    }) as never)
  })

  afterEach(() => {
    process.argv = realArgv
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    while (tmpDirs.length > 0) {
      rmSync(tmpDirs.pop()!, { recursive: true, force: true })
    }
  })

  it('creates the config file with table defaults and 0o600 when missing', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    withConfigArg(path)

    loadConfig()

    expect(existsSync(path)).toBe(true)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    const written = JSON.parse(readFileSync(path, 'utf-8'))
    expect(written.server.port).toBe(4321)
    expect(written.storage.database).toBe('')
    expect(written.security.sessionSecret).toBe('')

    // The auto-created file (empty strings for unset secrets) must pass
    // its own schema on the NEXT load — '' means "unset".
    expect(() => loadConfig()).not.toThrow()
  })

  it('reads values from the config file', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { storage: { database: '/data/from-file.db' } })
    withConfigArg(path)

    const env = loadConfig()
    expect(env['storage.database']).toBe('/data/from-file.db')
    expect(env['server.port']).toBeUndefined() // not in file, no env → schema default later
  })

  it('env vars override the file and are written back', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { storage: { database: '/data/from-file.db' }, server: { port: 4000 } })
    withConfigArg(path)
    vi.stubEnv('storage__database', '/data/from-env.db')
    vi.stubEnv('server__port', '5000')

    const env = loadConfig()
    expect(env['storage.database']).toBe('/data/from-env.db')
    expect(env['server.port']).toBe('5000')

    const written = JSON.parse(readFileSync(path, 'utf-8'))
    expect(written.storage.database).toBe('/data/from-env.db')
    // parseValues: numeric strings land as native JSON numbers
    expect(written.server.port).toBe(5000)
  })

  it('survives an unwritable config location (warns, keeps effective values in memory)', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { storage: { database: '/data/from-file.db' } })
    // The write-back goes tmp+rename — a read-only FILE doesn't stop it
    // (the tmp file is new), but a read-only DIRECTORY does.
    chmodSync(dir, 0o500)
    withConfigArg(path)
    vi.stubEnv('storage__database', '/data/from-env.db')

    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const env = loadConfig()
      expect(env['storage.database']).toBe('/data/from-env.db')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('无法将环境变量覆盖写回配置文件'))
    } finally {
      chmodSync(dir, 0o700)
    }
  })

  it('keeps transformed-schema values raw on the file round-trip', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { security: { sessionSecret: 'a-secret-that-is-at-least-32-characters-long' } })
    withConfigArg(path)

    // sessionSecret's schema transforms string → string[]; loadConfig must
    // return the RAW file value (the transform runs once, downstream in
    // loadServerConfig).
    const env = loadConfig()
    expect(env['security.sessionSecret']).toBe('a-secret-that-is-at-least-32-characters-long')

    // An env override writes a raw string back — never the transformed shape.
    vi.stubEnv('security__sessionSecret', 'another-secret-that-is-at-least-32-chars')
    loadConfig()
    const written = JSON.parse(readFileSync(path, 'utf-8'))
    expect(written.security.sessionSecret).toBe('another-secret-that-is-at-least-32-chars')
  })

  it('rejects a config file whose comma-joined sessionSecrets are individually under 32 chars', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    // 20 + 20 chars: the joined string clears min(32), each secret does
    // not — the floor must apply per secret, after the split (audit P1-17).
    writeConfig(path, { security: { sessionSecret: `${'a'.repeat(20)},${'b'.repeat(20)}` } })
    withConfigArg(path)

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() => loadConfig()).toThrow('process.exit called')
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('无效内容'))
  })

  it('fails on malformed JSON with the file name in the message', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeFileSync(path, '{ not json')
    withConfigArg(path)

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() => loadConfig()).toThrow('process.exit called')
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining(`配置文件 ${path} 不是合法的 JSON`))
  })

  it('fails on unknown keys with the offending path', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { storage: { database: '/x.db', nope: true } })
    withConfigArg(path)

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() => loadConfig()).toThrow('process.exit called')
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('包含无效内容'))
  })

  it('supports -c and --config=<path> forms', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { storage: { database: '/flag.db' } })

    process.argv = [realArgv[0]!, realArgv[1]!, '-c', path]
    expect(loadConfig()['storage.database']).toBe('/flag.db')

    process.argv = [realArgv[0]!, realArgv[1]!, `--config=${path}`]
    expect(loadConfig()['storage.database']).toBe('/flag.db')
  })

  it('returns env-only values without --config under VITEST (no file access)', () => {
    // Run from a scratch cwd so the assertion does not depend on whether
    // the developer's repo happens to have a kobato.config.json.
    const dir = makeTmpDir()
    const realCwd = process.cwd()
    process.chdir(dir)
    try {
      process.argv = [realArgv[0]!, realArgv[1]!]
      vi.stubEnv('storage__database', ':memory:')

      const env = loadConfig()
      expect(env['storage.database']).toBe(':memory:')
      expect(existsSync(configPathIn(dir))).toBe(false)
    } finally {
      process.chdir(realCwd)
    }
  })

  it('ignores flat legacy env names — only the __ convention is read', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { storage: { database: '/from-file.db' } })
    withConfigArg(path)
    // The pre-rename flat name must NOT take effect.
    vi.stubEnv('DATABASE_URL', 'postgres://legacy-flat/db')

    expect(loadConfig()['storage.database']).toBe('/from-file.db')
  })

  it('migrates legacy keys on load, rewrites the file, and keeps booting', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    // A file in the pre-rename shape: old sections plus the removed redis
    // block every auto-created file from that era carries.
    writeConfig(path, {
      database: { url: 'postgres://from-file/db' },
      auth: { sessionSecret: 'a-secret-that-is-at-least-32-characters-long' },
      paths: { data: '/var/lib/kobato', defaultFont: '/usr/share/fonts/x.ttf' },
      logging: { level: 'debug' },
      redis: { url: 'redis://localhost:6379' },
    })
    withConfigArg(path)

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const env = loadConfig()
    expect(env['security.sessionSecret']).toBe('a-secret-that-is-at-least-32-characters-long')
    expect(env['storage.data']).toBe('/var/lib/kobato')
    expect(env['storage.defaultFont']).toBe('/usr/share/fonts/x.ttf')
    expect(env['server.loggingLevel']).toBe('debug')

    // One Chinese summary line naming every applied migration.
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining(
        `已迁移配置文件 ${path} 中的旧配置项:auth.sessionSecret → security.sessionSecret, paths.data → storage.data, paths.defaultFont → storage.defaultFont, logging.level → server.loggingLevel, redis(已删除)`,
      ),
    )

    // The file was rewritten in the new shape — old sections and redis gone.
    const written = JSON.parse(readFileSync(path, 'utf-8'))
    expect(written).toEqual({
      security: { sessionSecret: 'a-secret-that-is-at-least-32-characters-long' },
      storage: { data: '/var/lib/kobato', defaultFont: '/usr/share/fonts/x.ttf' },
      server: { loggingLevel: 'debug' },
    })

    // The rewritten file loads clean: strict schema passes, no re-migration.
    stderr.mockClear()
    expect(() => loadConfig()).not.toThrow()
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining('已迁移配置文件'))
  })
})

describe('infra/config — loadServerConfig', () => {
  beforeEach(() => {
    clearConfigEnv()
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called')
    }) as never)
  })

  afterEach(() => {
    process.argv = realArgv
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  function stubRequiredEnv(): void {
    process.argv = [realArgv[0]!, realArgv[1]!]
    vi.stubEnv('storage__database', ':memory:')
    vi.stubEnv('storage__analyticsDatabase', ':memory:')
    vi.stubEnv('security__sessionSecret', 'vitest-session-secret-must-be-at-least-32-chars-long-ok')
    vi.stubEnv('security__encryptionKey', 'vitest-encryption-key-must-be-at-least-32-chars-long-ok')
    vi.stubEnv('storage__data', '/tmp/kobato-data')
  }

  it('assembles the nested validated config with schema defaults applied', () => {
    stubRequiredEnv()

    const config = loadServerConfig()

    expect(config.storage.database).toBe(':memory:')
    expect(config.server.host).toBe('0.0.0.0')
    expect(config.server.port).toBe(4321)
    expect(config.storage.data).toBe('/tmp/kobato-data')
  })

  it('runs the sessionSecret transform exactly once (string → string[])', () => {
    stubRequiredEnv()
    vi.stubEnv('security__sessionSecret', 'first-secret-at-least-32-characters!!, second-secret-at-least-32-chars!')

    const config = loadServerConfig()

    expect(config.security.sessionSecret).toEqual([
      'first-secret-at-least-32-characters!!',
      'second-secret-at-least-32-chars!',
    ])
  })

  it('rejects a sessionSecret list whose individual secrets are under 32 chars', () => {
    stubRequiredEnv()
    // 20 + 20 chars: the joined string clears min(32), each secret does
    // not — validating before the split would let this through (audit P1-17).
    vi.stubEnv('security__sessionSecret', `${'a'.repeat(20)},${'b'.repeat(20)}`)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    expect(() => loadServerConfig()).toThrow('process.exit called')
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('security.sessionSecret'))
  })

  it('accepts multiple sessionSecrets that each meet the 32-char floor', () => {
    stubRequiredEnv()
    vi.stubEnv('security__sessionSecret', `${'a'.repeat(32)}, ${'b'.repeat(40)}`)

    const config = loadServerConfig()

    expect(config.security.sessionSecret).toEqual(['a'.repeat(32), 'b'.repeat(40)])
  })

  it('treats empty-string optional values as unset (an auto-created file boots)', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, {
      security: {
        sessionSecret: 'a-secret-that-is-at-least-32-characters-long',
        encryptionKey: 'an-encryption-key-at-least-32-chars-long',
      },
      storage: { data: '/tmp/kobato-data', database: '/tmp/kobato.db', defaultFont: '' },
    })
    withConfigArg(path)

    const config = loadServerConfig()

    expect(config.storage.defaultFont).toBeUndefined()
    expect(config.storage.database).toBe('/tmp/kobato.db')
  })

  it('fails with the Chinese bootstrap hint when a required value is missing', () => {
    process.argv = [realArgv[0]!, realArgv[1]!]
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    expect(() => loadServerConfig()).toThrow('process.exit called')
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('storage.database'))
  })

  it('fails when an env override does not satisfy its schema', () => {
    stubRequiredEnv()
    vi.stubEnv('server__port', 'not-a-number')
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    expect(() => loadServerConfig()).toThrow('process.exit called')
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Environment validation failed'))
  })

  it('rejects a low-entropy encryptionKey even at 32+ characters', () => {
    stubRequiredEnv()
    vi.stubEnv('security__encryptionKey', 'a'.repeat(40))
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    expect(() => loadServerConfig()).toThrow('process.exit called')
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('encryptionKey is too weak'))
  })

  it('accepts a hex encryptionKey from openssl rand (16 distinct characters)', () => {
    stubRequiredEnv()
    const hexKey = '3f8a1c9e2b7d4056a8c1e3f5b9d2046789abcdef01234567890abcdef1234567'
    vi.stubEnv('security__encryptionKey', hexKey)

    const config = loadServerConfig()

    expect(config.security.encryptionKey).toBe(hexKey)
  })
})

describe('infra/config — migrateLegacyKeys', () => {
  it('moves auth.sessionSecret into security and drops the emptied auth section', () => {
    const data: Record<string, unknown> = { auth: { sessionSecret: 'secret' } }

    const { migrated, notes } = migrateLegacyKeys(data)

    expect(migrated).toBe(true)
    expect(data).toEqual({ security: { sessionSecret: 'secret' } })
    expect(notes).toEqual(['auth.sessionSecret → security.sessionSecret'])
  })

  it('merges into an existing security section without touching its other keys', () => {
    const data: Record<string, unknown> = {
      auth: { sessionSecret: 'secret' },
      security: { encryptionKey: 'key' },
    }

    migrateLegacyKeys(data)

    expect(data).toEqual({ security: { encryptionKey: 'key', sessionSecret: 'secret' } })
  })

  it('never overwrites an existing security.sessionSecret — the legacy value is dropped', () => {
    const data: Record<string, unknown> = {
      auth: { sessionSecret: 'old-secret' },
      security: { sessionSecret: 'new-secret' },
    }

    const { notes } = migrateLegacyKeys(data)

    expect(data).toEqual({ security: { sessionSecret: 'new-secret' } })
    expect(notes).toEqual(['auth.sessionSecret → security.sessionSecret(目标已存在,丢弃旧值)'])
  })

  it('moves every paths key into storage and deletes the paths section', () => {
    const data: Record<string, unknown> = { paths: { data: '/data', defaultFont: '/font.ttf' } }

    const { notes } = migrateLegacyKeys(data)

    expect(data).toEqual({ storage: { data: '/data', defaultFont: '/font.ttf' } })
    expect(notes).toEqual(['paths.data → storage.data', 'paths.defaultFont → storage.defaultFont'])
  })

  it('keeps existing storage keys when merging paths (per-key no-overwrite)', () => {
    const data: Record<string, unknown> = {
      paths: { data: '/old-data', defaultFont: '/old-font.ttf' },
      storage: { data: '/new-data' },
    }

    const { notes } = migrateLegacyKeys(data)

    expect(data).toEqual({ storage: { data: '/new-data', defaultFont: '/old-font.ttf' } })
    expect(notes).toEqual(['paths.data → storage.data(目标已存在,丢弃旧值)', 'paths.defaultFont → storage.defaultFont'])
    expect('paths' in data).toBe(false)
  })

  it('moves logging.level into server.loggingLevel and drops the emptied logging section', () => {
    const data: Record<string, unknown> = { logging: { level: 'debug' } }

    const { notes } = migrateLegacyKeys(data)

    expect(data).toEqual({ server: { loggingLevel: 'debug' } })
    expect(notes).toEqual(['logging.level → server.loggingLevel'])
  })

  it('never overwrites an existing server.loggingLevel', () => {
    const data: Record<string, unknown> = {
      logging: { level: 'debug' },
      server: { loggingLevel: 'warn' },
    }

    migrateLegacyKeys(data)

    expect(data).toEqual({ server: { loggingLevel: 'warn' } })
  })

  it('deletes the redis block whatever its value', () => {
    for (const redis of [{ url: 'redis://x' }, 'redis://x', null, 6379]) {
      const data: Record<string, unknown> = { redis }

      const { migrated, notes } = migrateLegacyKeys(data)

      expect(migrated).toBe(true)
      expect('redis' in data).toBe(false)
      expect(notes).toEqual(['redis(已删除)'])
    }
  })

  it('cleans up empty legacy sections left by stripEmptyStrings-era write-backs', () => {
    const data: Record<string, unknown> = { auth: {}, paths: {}, logging: {} }

    const { migrated, notes } = migrateLegacyKeys(data)

    expect(migrated).toBe(true)
    expect(data).toEqual({})
    expect(notes).toEqual(['auth(已删除)', 'paths(已删除)', 'logging(已删除)'])
  })

  it('keeps non-string legacy secrets and unknown legacy keys for the strict schema to reject', () => {
    const data: Record<string, unknown> = { auth: { sessionSecret: 123 }, logging: { extra: true } }

    const { migrated } = migrateLegacyKeys(data)

    expect(migrated).toBe(false)
    expect(data).toEqual({ auth: { sessionSecret: 123 }, logging: { extra: true } })
  })

  it('is idempotent — a migrated file reports no changes on the next pass', () => {
    const data: Record<string, unknown> = {
      auth: { sessionSecret: 'secret' },
      paths: { data: '/data' },
      logging: { level: 'info' },
      redis: { url: 'redis://x' },
    }

    expect(migrateLegacyKeys(data).migrated).toBe(true)
    const second = migrateLegacyKeys(data)
    expect(second.migrated).toBe(false)
    expect(second.notes).toEqual([])
    expect(data).toEqual({
      security: { sessionSecret: 'secret' },
      storage: { data: '/data' },
      server: { loggingLevel: 'info' },
    })
  })
})

describe('infra/config — CONFIG_TABLE', () => {
  it('derives every env var name by the `__` convention (path.join)', () => {
    expect(configEnvName(['storage', 'database'])).toBe('storage__database')
    for (const entry of CONFIG_TABLE) {
      expect(configEnvName(entry.path)).toBe(entry.path.join('__'))
    }
  })

  it('declares each dotted path exactly once', () => {
    // A duplicate path would silently shadow itself in buildFileSchema and
    // defaultFileContents — one row would win, the other would be dead.
    const paths = CONFIG_TABLE.map((entry) => entry.path.join('.'))
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('infra/config — configCandidates', () => {
  const seaEnv = { sea: false, cwd: '/work/app', home: '/home/user' }

  it('orders --config > execDir (SEA) > cwd > ~/.config', () => {
    expect(configCandidates([], seaEnv)).toEqual([
      '/work/app/kobato.config.json',
      '/home/user/.config/kobato.config.json',
    ])
    expect(configCandidates([], { ...seaEnv, sea: true })).toEqual([
      join(dirname(process.execPath), 'kobato.config.json'),
      '/work/app/kobato.config.json',
      '/home/user/.config/kobato.config.json',
    ])
    expect(configCandidates(['--config', '/tmp/x.json'], seaEnv)[0]).toBe('/tmp/x.json')
  })
})
