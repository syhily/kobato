// Configuration file (`kobato.config.json`) — the default configuration
// source, always present (auto-created when missing). This module is the
// single configuration entry point: it resolves the effective values,
// validates them, and exposes the nested `serverConfig` object every
// consumer reads.
//
//   - ONE declarative table (CONFIG_TABLE) is the single source of truth:
//     each row maps a nested config path (`storage.database`) to a Zod schema.
//     The process env var name is derived by convention: `path.join('__')`
//     → `storage__database`.
//   - Precedence: schema defaults < config file < env vars. Values coming
//     from env that differ from the file are WRITTEN BACK into the file —
//     env is the injection mechanism, the file converges to the effective
//     configuration and stays the persistent record.
//   - Location order: `--config <path>` / `-c <path>` (also `--config=…`)
//     > `<execDir>/kobato.config.json` (SEA only — non-SEA execPath is the
//     node binary itself) > `./kobato.config.json` > `~/.config/kobato.config.json`.
//     The first existing file wins; when none exists, the file is created
//     at the first candidate with table defaults and mode 0o600.
//   - Legacy keys from older releases (`auth.sessionSecret`, `paths.*`,
//     `logging.level`, the removed `redis` block) are migrated to the
//     current layout on load and the file is rewritten, so config files
//     written by older versions keep booting (see migrateLegacyKeys).
//
// `VITEST=true` makes loading read-only (no create, no write-back) and
// skips the file entirely unless `--config` is given — otherwise test runs
// would drop a config file into the repo root and persist test secrets.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

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
    schema: z
      .string()
      .min(32)
      .transform((val) => val.split(',').map((s) => s.trim())),
    fileDefault: '',
  },
  { path: ['security', 'encryptionKey'], schema: z.string().min(32), fileDefault: '' },
  { path: ['storage', 'data'], schema: z.string().min(1), fileDefault: './data' },
  {
    path: ['storage', 'database'],
    // Empty resolves to `<storage.data>/kobato.db` at open time, so the
    // default tracks a custom `storage.data` without duplicating it.
    // `:memory:` is allowed for tests. The `.default('')` matters for
    // config files written before this key existed (PG-era files carry
    // no `storage.database`).
    schema: z.string().default(''),
    fileDefault: '',
  },
  {
    path: ['storage', 'analyticsDatabase'],
    // DuckDB analytics file. Empty resolves to `<storage.data>/analytics.duckdb`.
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

// ─── Config file location ────────────────────────────────────────────────

/** Scan argv for `--config <path>` / `-c <path>` / `--config=<path>`. */
function argvConfigPath(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--config' || arg === '-c') {
      const next = argv[i + 1]
      if (next === undefined) {
        fail(`命令行参数 ${arg} 需要一个配置文件路径。`)
      }
      return resolve(next)
    }
    if (arg.startsWith('--config=')) {
      return resolve(arg.slice('--config='.length))
    }
  }
  return null
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
    // Only the SEA binary owns its executable path; under plain node,
    // execPath is the node binary itself and must not be consulted.
    sea ? join(dirname(process.execPath), CONFIG_FILE_NAME) : null,
    join(cwd, CONFIG_FILE_NAME),
    join(home, '.config', CONFIG_FILE_NAME),
  ]
  return candidates.filter((candidate): candidate is string => candidate !== null)
}

// ─── File schema (generated from the table) ──────────────────────────────

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
    // Every level optional: partial config files are legal — missing values
    // fall through to schema defaults or env vars.
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

// ─── Helpers ─────────────────────────────────────────────────────────────

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

/** '' means "unset" in the config file (mirrors emptyStringAsUndefined on
 *  the env side) — strip it before validation so an auto-created file
 *  with empty secrets passes its own schema on the next boot. */
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

// ─── Legacy key migration ────────────────────────────────────────────────

/**
 * In-place migration for config files written before the config-key renames.
 * Legacy values MOVE into the current layout without overwriting existing
 * values; a legacy key whose target slot is taken is dropped. Returns one
 * Chinese note per consumed legacy key.
 */
export function migrateLegacyKeys(data: Record<string, unknown>): { migrated: boolean; notes: string[] } {
  const notes: string[] = []
  // '' means "unset" in the config file (see stripEmptyStrings) — a target
  // slot holding '' must not block a real legacy value from moving over.
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
    // An emptied section must not survive — the strict schema rejects it
    // (env write-backs could persist `auth: {}` after stripEmptyStrings).
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

  // redis: dropped together with the Redis dependency — old auto-created
  // files all carry the block, and the strict schema would reject it.
  if ('redis' in data) {
    delete data.redis
    notes.push('redis(已删除)')
  }

  // database: the Postgres era. `database.url` has no meaningful mapping
  // to a SQLite file path, so the section is dropped (like redis) rather
  // than auto-moved — the new `storage.database` default applies.
  if ('database' in data) {
    delete data.database
    notes.push('database(已删除)')
  }

  return { migrated: notes.length > 0, notes }
}

// ─── Main entry ──────────────────────────────────────────────────────────

/**
 * Resolve the effective raw values, keyed by dotted config path
 * (`'storage.database'`): schema defaults < config file < env vars,
 * persisting env overrides back into the file. Fails the process
 * (clear Chinese message) on unreadable/invalid config files.
 *
 * The values are RAW (untransformed) — the per-entry schema parse
 * (defaults, coercion, transforms) runs downstream in
 * {@link loadServerConfig}, exactly once.
 */
export function loadConfig(): Record<string, unknown> {
  const explicit = argvConfigPath(process.argv.slice(2))
  // Vitest without an explicit --config: env-only, never touch the
  // filesystem — otherwise test runs would drop a config file into the
  // repo root and persist test secrets. An explicit --config opts into
  // the full behavior (tests point it at a temp dir).
  if (process.env.VITEST === 'true' && explicit === null) {
    return Object.fromEntries(
      CONFIG_TABLE.map((entry) => [entry.path.join('.'), process.env[configEnvName(entry.path)]]),
    )
  }
  const candidates = configCandidates(process.argv.slice(2))

  // An explicit --config is a directive, not a candidate: use it even
  // when the file doesn't exist yet (it is created there), instead of
  // falling through to a config found in the cwd or home directory.
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
    // Read values from the RAW (stripped) JSON, not result.data: schemas
    // like sessionSecret carry a transform (string → string[]), and the
    // transformed output must never round-trip back into the file — the
    // final transform runs exactly once, downstream in createEnv.
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

// ─── Validated runtime configuration ─────────────────────────────────────

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
 * Parse every CONFIG_TABLE entry exactly once (defaults, coercion and
 * transforms apply here) and assemble the nested {@link ServerConfig}.
 * Validation failures are fatal with a Chinese bootstrap hint — the
 * logger is not available this early, so the message goes to stderr.
 */
export function loadServerConfig(): ServerConfig {
  const raw = loadConfig()
  const config: Record<string, unknown> = {}
  const issues: string[] = []
  for (const entry of CONFIG_TABLE) {
    const key = entry.path.join('.')
    // '' means "unset" (same convention as stripEmptyStrings on the file
    // side) — an auto-created file holds '' for optional values, and those
    // must fall through to the schema default, not fail min(1).
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
