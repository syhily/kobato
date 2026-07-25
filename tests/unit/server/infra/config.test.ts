import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CONFIG_TABLE, configCandidates, configEnvName, loadConfig, migrateLegacyKeys } from '@/server/infra/config'

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
    expect(written.database.poolMax).toBe(20)
    expect(written.security.sessionSecret).toBe('')

    // The auto-created file (empty strings for unset secrets) must pass
    // its own schema on the NEXT load — '' means "unset".
    expect(() => loadConfig()).not.toThrow()
  })

  it('reads values from the config file', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { database: { url: 'postgres://from-file/db' } })
    withConfigArg(path)

    const env = loadConfig()
    expect(env.DATABASE_URL).toBe('postgres://from-file/db')
    expect(env.PORT).toBeUndefined() // not in file, no env → schema default later
  })

  it('env vars override the file and are written back', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { database: { url: 'postgres://from-file/db' }, server: { port: 4000 } })
    withConfigArg(path)
    vi.stubEnv('database__url', 'postgres://from-env/db')
    vi.stubEnv('server__port', '5000')

    const env = loadConfig()
    expect(env.DATABASE_URL).toBe('postgres://from-env/db')
    expect(env.PORT).toBe('5000')

    const written = JSON.parse(readFileSync(path, 'utf-8'))
    expect(written.database.url).toBe('postgres://from-env/db')
    // parseValues: numeric strings land as native JSON numbers
    expect(written.server.port).toBe(5000)
  })

  it('survives an unwritable config location (warns, keeps effective values in memory)', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { database: { url: 'postgres://from-file/db' } })
    // The write-back goes tmp+rename — a read-only FILE doesn't stop it
    // (the tmp file is new), but a read-only DIRECTORY does.
    chmodSync(dir, 0o500)
    withConfigArg(path)
    vi.stubEnv('database__url', 'postgres://from-env/db')

    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const env = loadConfig()
      expect(env.DATABASE_URL).toBe('postgres://from-env/db')
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
    // return the RAW file value (the transform runs once, in createEnv).
    const env = loadConfig()
    expect(env.SESSION_SECRET).toBe('a-secret-that-is-at-least-32-characters-long')

    // An env override writes a raw string back — never the transformed shape.
    vi.stubEnv('security__sessionSecret', 'another-secret-that-is-at-least-32-chars')
    loadConfig()
    const written = JSON.parse(readFileSync(path, 'utf-8'))
    expect(written.security.sessionSecret).toBe('another-secret-that-is-at-least-32-chars')
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
    writeConfig(path, { database: { url: 'postgres://x/db', nope: true } })
    withConfigArg(path)

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() => loadConfig()).toThrow('process.exit called')
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('包含无效内容'))
  })

  it('supports -c and --config=<path> forms', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { database: { url: 'postgres://flag/db' } })

    process.argv = [realArgv[0]!, realArgv[1]!, '-c', path]
    expect(loadConfig().DATABASE_URL).toBe('postgres://flag/db')

    process.argv = [realArgv[0]!, realArgv[1]!, `--config=${path}`]
    expect(loadConfig().DATABASE_URL).toBe('postgres://flag/db')
  })

  it('returns env-only values without --config under VITEST (no file access)', () => {
    process.argv = [realArgv[0]!, realArgv[1]!]
    vi.stubEnv('database__url', 'postgres://env-only/db')

    const env = loadConfig()
    expect(env.DATABASE_URL).toBe('postgres://env-only/db')
    expect(existsSync(configPathIn(process.cwd()))).toBe(false)
  })

  it('ignores flat legacy env names — only the __ convention is read', () => {
    const dir = makeTmpDir()
    const path = configPathIn(dir)
    writeConfig(path, { database: { url: 'postgres://from-file/db' } })
    withConfigArg(path)
    // The pre-rename flat name must NOT take effect.
    vi.stubEnv('DATABASE_URL', 'postgres://legacy-flat/db')

    expect(loadConfig().DATABASE_URL).toBe('postgres://from-file/db')
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
    expect(env.SESSION_SECRET).toBe('a-secret-that-is-at-least-32-characters-long')
    expect(env.DATA_PATH).toBe('/var/lib/kobato')
    expect(env.DEFAULT_FONT_PATH).toBe('/usr/share/fonts/x.ttf')
    expect(env.LOG_LEVEL).toBe('debug')

    // One Chinese summary line naming every applied migration.
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining(
        `已迁移配置文件 ${path} 中的旧配置项:auth.sessionSecret → security.sessionSecret, paths.data → storage.data, paths.defaultFont → storage.defaultFont, logging.level → server.loggingLevel, redis(已删除)`,
      ),
    )

    // The file was rewritten in the new shape — old sections and redis gone.
    const written = JSON.parse(readFileSync(path, 'utf-8'))
    expect(written).toEqual({
      database: { url: 'postgres://from-file/db' },
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
