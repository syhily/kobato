import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CONFIG_TABLE, configCandidates, configEnvName, loadConfig } from '@/server/infra/config'

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
    expect(written.auth.sessionSecret).toBe('')

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
    writeConfig(path, { auth: { sessionSecret: 'a-secret-that-is-at-least-32-characters-long' } })
    withConfigArg(path)

    // sessionSecret's schema transforms string → string[]; loadConfig must
    // return the RAW file value (the transform runs once, in createEnv).
    const env = loadConfig()
    expect(env.SESSION_SECRET).toBe('a-secret-that-is-at-least-32-characters-long')

    // An env override writes a raw string back — never the transformed shape.
    vi.stubEnv('auth__sessionSecret', 'another-secret-that-is-at-least-32-chars')
    loadConfig()
    const written = JSON.parse(readFileSync(path, 'utf-8'))
    expect(written.auth.sessionSecret).toBe('another-secret-that-is-at-least-32-chars')
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
