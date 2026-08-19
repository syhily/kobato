// Single configuration entry point: resolves the config file (auto-created
// when missing) + env overrides, validates, and exposes `serverConfig`.
// CONFIG_TABLE is the single source of truth (env name = path joined by
// `__`); `VITEST=true` without `--config` is env-only, no filesystem access.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

import { parseConfigArg } from '@/server/infra/config-arg'
import { isSea } from '@/server/infra/sea'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

export const CONFIG_FILE_NAME = 'kobato.config.json'

export interface ConfigEntry {
  /** Nested path inside the config file, e.g. ['database', 'url']. */
  path: readonly string[]
  schema: z.ZodType
  /** Value written into a freshly created config file. */
  fileDefault: unknown
}

export const CONFIG_TABLE = [
  { path: ['server', 'host'], schema: z.string().min(1).default('0.0.0.0'), fileDefault: '0.0.0.0' },
  {
    path: ['server', 'port'],
    schema: z.coerce.number().int().min(1).max(65535).default(4321),
    fileDefault: 4321,
  },
  {
    path: ['server', 'loggingLevel'],
    schema: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
    fileDefault: 'info',
  },
  {
    path: ['security', 'sessionSecret'],
    // The 32-char floor applies to EACH comma-separated secret after split/trim (audit P1-17).
    schema: z
      .string()
      .transform((val) => val.split(',').map((s) => s.trim()))
      .pipe(z.array(z.string().min(32)).min(1)),
    fileDefault: '',
  },
  {
    path: ['security', 'encryptionKey'],
    // Distinct-character floor blocks trivially weak keys like 'aaaa…'.
    schema: z
      .string()
      .min(32)
      .refine((val) => new Set(val).size >= 10, {
        message: 'encryptionKey is too weak (needs 10+ distinct characters) — generate one with: openssl rand -hex 32',
      }),
    fileDefault: '',
  },
  { path: ['storage', 'data'], schema: z.string().min(1), fileDefault: './data' },
  {
    path: ['storage', 'database'],
    // Empty → `<storage.data>/kobato.db` at open time (tracks a custom
    // `storage.data` without duplicating it); `:memory:` allowed for tests.
    // `.default('')` covers config files written before this key existed.
    schema: z.string().default(''),
    fileDefault: '',
  },
  {
    path: ['storage', 'analyticsDatabase'],
    schema: z.string().default(''),
    fileDefault: '',
  },
  {
    path: ['storage', 'defaultFont'],
    schema: z.string().min(1).optional(),
    fileDefault: '',
  },
] as const satisfies readonly ConfigEntry[]

/** Process env var name for a table entry — `__` separator convention. */
export function configEnvName(path: readonly string[]): string {
  return path.join('__')
}

function argvConfigPath(argv: string[]): string | null {
  const explicit = parseConfigArg(argv)
  if (explicit === undefined) {
    // `--config`/`-c` with no value parses as absent — re-scan for the flag name to fail precisely.
    const flag = argv.find((arg) => arg === '--config' || arg === '-c')
    if (flag !== undefined) {
      fail(`命令行参数 ${flag} 需要一个配置文件路径。`)
    }
    return null
  }
  return resolve(explicit)
}

export interface ConfigCandidateEnv {
  sea: boolean
  cwd: string
  home: string
}

/** Location order: --config/-c > <execDir> (SEA only) > cwd > ~/.config. */
export function configCandidates(argv: string[], env?: ConfigCandidateEnv): string[] {
  const explicit = argvConfigPath(argv)
  const { sea, cwd, home } = env ?? { sea: isSea(), cwd: process.cwd(), home: homedir() }
  const candidates: (string | null)[] = [
    explicit,
    // Non-SEA execPath is the node binary itself — only the SEA binary owns its path.
    sea ? join(dirname(process.execPath), CONFIG_FILE_NAME) : null,
    join(cwd, CONFIG_FILE_NAME),
    join(home, '.config', CONFIG_FILE_NAME),
  ]
  return candidates.filter((candidate): candidate is string => candidate !== null)
}

interface FileSchemaNode {
  children: Record<string, FileSchemaNode>
  entry?: ConfigEntry
}

function buildFileSchema(): z.ZodType {
  const root: FileSchemaNode = { children: {} }
  for (const entry of CONFIG_TABLE) {
    let node = root
    for (const key of entry.path.slice(0, -1)) {
      node.children[key] ??= { children: {} }
      node = node.children[key]
    }
    node.children[entry.path[entry.path.length - 1]] = { children: {}, entry }
  }
  const build = (node: FileSchemaNode): z.ZodType => {
    if (node.entry) {
      return node.entry.schema.optional()
    }
    const shape: Record<string, z.ZodType> = {}
    for (const [key, child] of Object.entries(node.children)) {
      shape[key] = build(child)
    }
    // Every level optional: partial config files fall through to defaults/env.
    return z.object(shape).strict().optional()
  }
  return build(root)
}

const fileSchema = buildFileSchema()

function defaultFileContents(): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const entry of CONFIG_TABLE) {
    let node = root
    for (const key of entry.path.slice(0, -1)) {
      node[key] ??= {}
      node = unsafeCast<Record<string, unknown>>(node[key])
    }
    node[entry.path[entry.path.length - 1]] = entry.fileDefault
  }
  return root
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function getPath(obj: Record<string, unknown>, path: readonly string[]): unknown {
  let node: unknown = obj
  for (const key of path) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      return undefined
    }
    node = unsafeCast<Record<string, unknown>>(node)[key]
  }
  return node
}

function setPath(obj: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let node = obj
  for (const key of path.slice(0, -1)) {
    node[key] ??= {}
    node = unsafeCast<Record<string, unknown>>(node[key])
  }
  node[path[path.length - 1]] = value
}

/** Ghost's `parseValues`: env strings land in the file as native JSON types. */
function parseEnvValue(raw: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw)
  }
  if (raw === 'true' || raw === 'false') {
    return raw === 'true'
  }
  return raw
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** '' means "unset" in the file (mirrors the env side) — strip before
 *  validation so an auto-created file passes its own schema next boot. */
function stripEmptyStrings(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripEmptyStrings)
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => [k, stripEmptyStrings(v)]),
    )
  }
  return value
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
}

function writeConfigFile(filePath: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  chmodSync(tempPath, 0o600)
  renameSync(tempPath, filePath)
}

/**
 * In-place migration for pre-rename config files: legacy values MOVE into the
 * current layout, never overwriting; one Chinese note per consumed key.
 */
export function migrateLegacyKeys(data: Record<string, unknown>): { migrated: boolean; notes: string[] } {
  const notes: string[] = []
  // A target slot holding '' (unset) must not block a real legacy value.
  const taken = (value: unknown): boolean => value !== undefined && value !== ''

  /** Move source[sourceKey] into target[targetKey]; never overwrite. */
  const moveKey = (
    source: Record<string, unknown>,
    sourceKey: string,
    target: Record<string, unknown>,
    targetKey: string,
    label: string,
  ): void => {
    if (taken(target[targetKey])) {
      notes.push(`${label}(目标已存在,丢弃旧值)`)
    } else {
      target[targetKey] = source[sourceKey]
      notes.push(label)
    }
    delete source[sourceKey]
  }

  // auth.sessionSecret → security.sessionSecret (the auth section is gone).
  const auth = data.auth
  if (isRecord(auth)) {
    const hadSecret = typeof auth.sessionSecret === 'string'
    if (hadSecret) {
      const security: Record<string, unknown> = isRecord(data.security) ? data.security : {}
      data.security = security
      moveKey(auth, 'sessionSecret', security, 'sessionSecret', 'auth.sessionSecret → security.sessionSecret')
    }
    // An emptied section must not survive — the strict schema rejects it.
    if (Object.keys(auth).length === 0) {
      delete data.auth
      if (!hadSecret) {
        notes.push('auth(已删除)')
      }
    }
  }

  // paths.* → storage.* (per-key move; the paths section is gone).
  const paths = data.paths
  if (isRecord(paths)) {
    if (Object.keys(paths).length > 0) {
      const storage: Record<string, unknown> = isRecord(data.storage) ? data.storage : {}
      data.storage = storage
      for (const key of Object.keys(paths)) {
        moveKey(paths, key, storage, key, `paths.${key} → storage.${key}`)
      }
    } else {
      notes.push('paths(已删除)')
    }
    delete data.paths
  }

  // logging.level → server.loggingLevel (the logging section is gone).
  const logging = data.logging
  if (isRecord(logging)) {
    const hadLevel = typeof logging.level === 'string'
    if (hadLevel) {
      const server: Record<string, unknown> = isRecord(data.server) ? data.server : {}
      data.server = server
      moveKey(logging, 'level', server, 'loggingLevel', 'logging.level → server.loggingLevel')
    }
    if (Object.keys(logging).length === 0) {
      delete data.logging
      if (!hadLevel) {
        notes.push('logging(已删除)')
      }
    }
  }

  // redis: dropped with the Redis dependency — old files carry the block and the strict schema rejects it.
  if ('redis' in data) {
    delete data.redis
    notes.push('redis(已删除)')
  }

  // database (Postgres era): no meaningful mapping to a SQLite path — dropped like redis.
  if ('database' in data) {
    delete data.database
    notes.push('database(已删除)')
  }

  return { migrated: notes.length > 0, notes }
}

/**
 * Resolve effective raw values keyed by dotted path, persisting env overrides
 * back into the file; fatal on unreadable/invalid files. Values stay RAW —
 * transforms run exactly once in `loadServerConfig`.
 */
export function loadConfig(): Record<string, unknown> {
  const explicit = argvConfigPath(process.argv.slice(2))
  // Vitest without --config: env-only, zero filesystem access (no config dropped into the repo, no secrets persisted).
  if (process.env.VITEST === 'true' && explicit === null) {
    return Object.fromEntries(
      CONFIG_TABLE.map((entry) => [entry.path.join('.'), process.env[configEnvName(entry.path)]]),
    )
  }
  const candidates = configCandidates(process.argv.slice(2))

  // An explicit --config is a directive: use it even when the file doesn't exist yet (it is created there).
  const filePath = explicit ?? candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]

  let fileData: Record<string, unknown>
  if (!existsSync(filePath)) {
    fileData = defaultFileContents()
    writeConfigFile(filePath, fileData)
    process.stderr.write(`已创建默认配置文件:${filePath}\n`)
  } else {
    let raw: string
    try {
      raw = readFileSync(filePath, 'utf-8')
    } catch (error) {
      fail(`无法读取配置文件 ${filePath}:${error instanceof Error ? error.message : String(error)}`)
    }
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(raw)
    } catch (error) {
      fail(`配置文件 ${filePath} 不是合法的 JSON:${error instanceof Error ? error.message : String(error)}`)
    }
    if (!isRecord(parsedJson)) {
      fail(`配置文件 ${filePath} 的顶层必须是一个 JSON 对象。`)
    }
    // Migrate legacy keys (renames + the removed redis block) before
    // validation — the strict file schema would reject them otherwise.
    const { migrated, notes } = migrateLegacyKeys(parsedJson)
    if (migrated) {
      try {
        writeConfigFile(filePath, parsedJson)
      } catch (error) {
        process.stderr.write(
          `警告:无法将迁移后的配置写回配置文件 ${filePath}(${error instanceof Error ? error.message : String(error)}),本次以内存中的生效值继续。\n`,
        )
      }
      process.stderr.write(`已迁移配置文件 ${filePath} 中的旧配置项:${notes.join(', ')}\n`)
    }
    const stripped = stripEmptyStrings(parsedJson)
    const result = fileSchema.safeParse(stripped)
    if (!result.success) {
      fail(`配置文件 ${filePath} 包含无效内容:\n${formatIssues(result.error.issues)}`)
    }
    // Use the RAW stripped JSON, not result.data: transformed output (sessionSecret → string[]) must never round-trip into the file.
    fileData = unsafeCast<Record<string, unknown>>(stripped)
  }

  const runtimeEnv: Record<string, unknown> = {}
  const overrides: { path: readonly string[]; value: unknown }[] = []
  for (const entry of CONFIG_TABLE) {
    const envRaw = process.env[configEnvName(entry.path)]
    const fileValue = getPath(fileData, entry.path)
    runtimeEnv[entry.path.join('.')] = envRaw ?? fileValue
    if (envRaw !== undefined && envRaw !== fileValue) {
      overrides.push({ path: entry.path, value: parseEnvValue(envRaw) })
    }
  }

  if (overrides.length > 0) {
    const next = structuredClone(fileData)
    for (const override of overrides) {
      setPath(next, override.path, override.value)
    }
    try {
      writeConfigFile(filePath, next)
    } catch (error) {
      process.stderr.write(
        `警告:无法将环境变量覆盖写回配置文件 ${filePath}(${error instanceof Error ? error.message : String(error)}),本次以内存中的生效值继续。\n`,
      )
    }
  }

  return runtimeEnv
}

/** The nested, validated configuration every consumer reads. */
export interface ServerConfig {
  server: {
    host: string
    port: number
    loggingLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent' | undefined
  }
  security: {
    /** Cookie-signing secrets for the session storage (rotatable, comma-separated in the file). */
    sessionSecret: string[]
    encryptionKey: string
  }
  storage: {
    data: string
    /** SQLite database file path. Empty → `<storage.data>/kobato.db`. */
    database: string
    /** DuckDB analytics file path. Empty → `<storage.data>/analytics.duckdb`. */
    analyticsDatabase: string
    defaultFont?: string | undefined
  }
}

/**
 * Parse every CONFIG_TABLE entry exactly once (defaults, coercion, transforms)
 * and assemble `ServerConfig`; fatal on validation failure (logger not up yet).
 */
export function loadServerConfig(): ServerConfig {
  const raw = loadConfig()
  const config: Record<string, unknown> = {}
  const issues: string[] = []
  for (const entry of CONFIG_TABLE) {
    const key = entry.path.join('.')
    // '' = unset — auto-created files hold it for optional values, which must fall through to the schema default.
    const value = raw[key] === '' ? undefined : raw[key]
    try {
      setPath(config, entry.path, entry.schema.parse(value))
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          issues.push(`  - ${key}: ${issue.message}`)
        }
      } else {
        issues.push(`  - ${key}: ${String(error)}`)
      }
    }
  }
  if (issues.length > 0) {
    process.stderr.write(
      [
        'Environment validation failed:',
        issues.join('\n'),
        '',
        'Please ensure the following values are set in kobato.config.json',
        '(or passed as `__`-style environment variables):',
        '',
        '    storage.database         — SQLite database file path (default: <storage.data>/kobato.db)',
        '    security.sessionSecret   — Session signing secret',
        '    security.encryptionKey   - The encryption key for sensitive content',
        '    storage.data             - Root directory for all local filesystem data',
        '',
      ].join('\n'),
    )
    process.exit(1)
  }
  return unsafeCast<ServerConfig>(config)
}

/** The validated runtime configuration, evaluated once at module load. */
export const serverConfig: ServerConfig = loadServerConfig()

// NODE_ENV stays process-env-only: it selects the process mode, not a
// deployment setting, so it never enters the config file.
export const NODE_ENV = z
  .enum(['development', 'production', 'test'])
  .optional()
  .default('production')
  .parse(process.env.NODE_ENV)

export function isVitest(): boolean {
  return process.env.VITEST === 'true'
}
