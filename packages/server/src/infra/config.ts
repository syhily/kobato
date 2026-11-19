import { parseConfigArg } from '@kobato/server/infra/config-arg.ts'
import { isValidTrustedProxyEntry } from '@kobato/server/infra/ip-match.ts'
import { isSea } from '@kobato/server/infra/sea/sea.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

export const CONFIG_FILE_NAME = 'kobato.config.json'

export interface ConfigEntry {
  path: readonly string[]
  schema: z.ZodType
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
      .transform((val) => val.split(',').map((s) => s.trim()))
      .pipe(z.array(z.string().min(32)).min(1)),
    fileDefault: '',
  },
  {
    path: ['security', 'encryptionKey'],
    schema: z
      .string()
      .min(32)
      .refine((val) => new Set(val).size >= 10, {
        message: 'encryptionKey is too weak (needs 10+ distinct characters) — generate one with: openssl rand -hex 32',
      }),
    fileDefault: '',
  },
  {
    path: ['security', 'trustedProxies'],
    schema: z
      .union([
        z.string().transform((val) =>
          val
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        ),
        z.array(z.string()),
      ])
      .pipe(
        z.array(
          z
            .string()
            .refine(isValidTrustedProxyEntry, {
              message: 'must be an IP address or an IPv4 CIDR (e.g. 172.18.0.0/16)',
            })
            .refine((entry) => entry !== '0.0.0.0/0', {
              message: '0.0.0.0/0 would trust proxy headers from any peer, disabling every per-IP rate limit',
            }),
        ),
      )
      .default([]),
    fileDefault: [],
  },
  { path: ['storage', 'data'], schema: z.string().min(1), fileDefault: './data' },
  {
    path: ['storage', 'database'],
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

export function configEnvName(path: readonly string[]): string {
  return path.join('__')
}

function argvConfigPath(argv: string[]): string | null {
  const explicit = parseConfigArg(argv)
  if (explicit === undefined) {
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
  /**
   * Explicit config path from `KOBATO_CONFIG_FILE`. Development tooling that
   * cannot use `--config` (the Vite CLI owns that flag) points the DEV server
   * at a throwaway config without touching the repository's own file.
   */
  configFile?: string
}

export function configCandidates(argv: string[], env?: ConfigCandidateEnv): string[] {
  const explicit = argvConfigPath(argv)
  const resolvedEnv = env ?? {
    sea: isSea(),
    cwd: process.cwd(),
    home: homedir(),
    configFile: process.env.KOBATO_CONFIG_FILE,
  }
  const { sea, cwd, home } = resolvedEnv
  const envConfig = resolvedEnv.configFile === undefined ? null : resolve(cwd, resolvedEnv.configFile)
  const candidates: (string | null)[] = [
    explicit,
    envConfig,
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

/** Ghost's `parseValues`: env strings land in the file as native JSON types.
 *  A coercion the entry's own schema would reject on the next boot — a
 *  numeric-looking SECRET landing as a Number in a z.string() slot (32+
 *  digits also lose precision), or a boolean into a string slot — corrupts
 *  the file being written, so the raw string is kept instead. */
function parseEnvValue(entry: ConfigEntry, raw: string): unknown {
  let value: unknown = raw
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    value = Number(raw)
  } else if (raw === 'true' || raw === 'false') {
    value = raw === 'true'
  }
  if (typeof value !== 'string' && !entry.schema.safeParse(value).success) {
    return raw
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

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

export function migrateLegacyKeys(data: Record<string, unknown>): { migrated: boolean; notes: string[] } {
  const notes: string[] = []
  const taken = (value: unknown): boolean => value !== undefined && value !== ''

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

  const auth = data.auth
  if (isRecord(auth)) {
    const hadSecret = typeof auth.sessionSecret === 'string'
    if (hadSecret) {
      const security: Record<string, unknown> = isRecord(data.security) ? data.security : {}
      data.security = security
      moveKey(auth, 'sessionSecret', security, 'sessionSecret', 'auth.sessionSecret → security.sessionSecret')
    }
    if (Object.keys(auth).length === 0) {
      delete data.auth
      if (!hadSecret) {
        notes.push('auth(已删除)')
      }
    }
  }

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

  if ('redis' in data) {
    delete data.redis
    notes.push('redis(已删除)')
  }

  if ('database' in data) {
    delete data.database
    notes.push('database(已删除)')
  }

  return { migrated: notes.length > 0, notes }
}

export type ConfigFileErrorKind = 'json' | 'shape' | 'schema'

export class ConfigFileError extends Error {
  constructor(
    readonly kind: ConfigFileErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'ConfigFileError'
  }
}

export interface ParsedConfigFile {
  /** The raw stripped JSON `loadConfig` keeps in memory — never the transformed output. */
  data: Record<string, unknown>
  migrated: boolean
  notes: string[]
}

export function parseConfigFileJson(raw: string): ParsedConfigFile {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch (error) {
    throw new ConfigFileError('json', `不是合法的 JSON:${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(parsedJson)) {
    throw new ConfigFileError('shape', '的顶层必须是一个 JSON 对象。')
  }
  const { migrated, notes } = migrateLegacyKeys(parsedJson)
  const stripped = stripEmptyStrings(parsedJson)
  const result = fileSchema.safeParse(stripped)
  if (!result.success) {
    throw new ConfigFileError('schema', `包含无效内容:\n${formatIssues(result.error.issues)}`)
  }
  return { data: unsafeCast<Record<string, unknown>>(stripped), migrated, notes }
}

export function parseRestorableConfigJson(raw: string): ParsedConfigFile {
  const parsed = parseConfigFileJson(raw)
  const issues: string[] = []
  for (const entry of CONFIG_TABLE) {
    const key = entry.path.join('.')
    const value = process.env[configEnvName(entry.path)] ?? getPath(parsed.data, entry.path)
    const result = entry.schema.safeParse(value === '' ? undefined : value)
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push(`  - ${key}: ${issue.message}`)
      }
    }
  }
  if (issues.length > 0) {
    throw new ConfigFileError('schema', `无法通过启动等价校验:\n${issues.join('\n')}`)
  }
  return parsed
}

export function resolveConfigFilePath(): string | null {
  const explicit = argvConfigPath(process.argv.slice(2))
  const envConfig = process.env.KOBATO_CONFIG_FILE
  if (process.env.VITEST === 'true' && explicit === null && envConfig === undefined) {
    return null
  }
  const candidates = configCandidates(process.argv.slice(2))
  return (
    explicit ??
    (envConfig === undefined ? null : resolve(envConfig)) ??
    candidates.find((candidate) => existsSync(candidate)) ??
    candidates[0]
  )
}

export function loadConfig(): Record<string, unknown> {
  const filePath = resolveConfigFilePath()
  if (filePath === null) {
    return Object.fromEntries(
      CONFIG_TABLE.map((entry) => [entry.path.join('.'), process.env[configEnvName(entry.path)]]),
    )
  }

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
    let parsed: ParsedConfigFile
    try {
      parsed = parseConfigFileJson(raw)
    } catch (error) {
      if (error instanceof ConfigFileError) {
        fail(`配置文件 ${filePath} ${error.message}`)
      }
      throw error
    }
    const { migrated, notes } = parsed
    if (migrated) {
      try {
        writeConfigFile(filePath, parsed.data)
      } catch (error) {
        process.stderr.write(
          `警告:无法将迁移后的配置写回配置文件 ${filePath}(${error instanceof Error ? error.message : String(error)}),本次以内存中的生效值继续。\n`,
        )
      }
      process.stderr.write(`已迁移配置文件 ${filePath} 中的旧配置项:${notes.join(', ')}\n`)
    }
    fileData = parsed.data
  }

  const runtimeEnv: Record<string, unknown> = {}
  const overrides: { path: readonly string[]; value: unknown }[] = []
  for (const entry of CONFIG_TABLE) {
    const envRaw = process.env[configEnvName(entry.path)]
    const fileValue = getPath(fileData, entry.path)
    runtimeEnv[entry.path.join('.')] = envRaw ?? fileValue
    if (envRaw !== undefined && envRaw !== fileValue) {
      overrides.push({ path: entry.path, value: parseEnvValue(entry, envRaw) })
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

export interface ServerConfig {
  server: {
    host: string
    port: number
    loggingLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent' | undefined
  }
  security: {
    sessionSecret: string[]
    encryptionKey: string
    trustedProxies: string[]
  }
  storage: {
    data: string
    database: string
    analyticsDatabase: string
    defaultFont?: string | undefined
  }
}

export function loadServerConfig(): ServerConfig {
  const raw = loadConfig()
  const config: Record<string, unknown> = {}
  const issues: string[] = []
  for (const entry of CONFIG_TABLE) {
    const key = entry.path.join('.')
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

export const serverConfig: ServerConfig = loadServerConfig()

export const NODE_ENV = z
  .enum(['development', 'production', 'test'])
  .optional()
  .default('production')
  .parse(process.env.NODE_ENV)

export function isVitest(): boolean {
  return process.env.VITEST === 'true'
}
