import { rateLimitDefaults } from '@kobato/settings/rate-limit-defaults.ts'
import { isRecord } from '@kobato/utils/type-guards.ts'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'

export interface SeedAdminOptions {
  email: string
  /** bcrypt hash of the admin's password (placeholder when the caller never logs in). */
  passwordHash: string
}

export interface SeedInstanceOptions {
  /** `blog.general` title (default: the SEA smoke identity). */
  title?: string
  description?: string
  /** Website origin baked into `blog.general` — a cover-less post's default OG cover is fetched from `<website>/`. */
  website?: string
}

export interface ConvergedConfig {
  database: string
  sessionSecret: string
}

export async function readConvergedConfig(configPath: string): Promise<ConvergedConfig> {
  const parsed: unknown = JSON.parse(await readFile(configPath, 'utf-8'))
  const storage = isRecord(parsed) && isRecord(parsed.storage) ? parsed.storage : null
  const security = isRecord(parsed) && isRecord(parsed.security) ? parsed.security : null
  if (storage === null || typeof storage.database !== 'string' || storage.database === '') {
    throw new Error(`config file did not converge: ${configPath} has no storage.database`)
  }
  if (security === null || typeof security.sessionSecret !== 'string' || security.sessionSecret.length < 32) {
    throw new Error(`config file did not converge: ${configPath} has no security.sessionSecret`)
  }
  return { database: storage.database, sessionSecret: security.sessionSecret }
}

export async function seedInstalledInstance(
  databasePath: string,
  admin: SeedAdminOptions,
  options: SeedInstanceOptions = {},
): Promise<string> {
  const year = new Date().getFullYear()
  const website = options.website ?? 'http://127.0.0.1'
  const general = JSON.stringify({
    title: options.title ?? 'Kobato Smoke',
    description: options.description ?? 'SEA smoke test instance',
    website,
    keywords: [],
    author: { name: 'Smoke Admin', email: admin.email, url: website },
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    timeFormat: 'yyyy-LL-dd HH:mm',
    initialYear: year,
    icpNo: '',
    moeIcpNo: '',
  })
  const assets = JSON.stringify({
    asset: { host: '127.0.0.1', scheme: 'http' },
    storage: {
      enabled: false,
      endpoint: '',
      region: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      forcePathStyle: false,
      urlTemplate: '',
    },
    upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
  })

  const db = new DatabaseSync(databasePath)
  try {
    const now = Date.now()
    db.prepare(
      `INSERT INTO "user" ("name", "email", "password", "role", "created_at", "updated_at")
       VALUES ('Smoke Admin', ?, ?, 'admin', ?, ?)
       ON CONFLICT ("email") DO NOTHING`,
    ).run(admin.email, admin.passwordHash, now, now)
    db.prepare(
      `INSERT INTO "setting" ("scope", "data", "updated_at", "updated_by")
       VALUES ('blog.general', ?, ?, NULL), ('blog.assets', ?, ?, NULL)
       ON CONFLICT ("scope") DO NOTHING`,
    ).run(general, now, assets, now)
    const row: unknown = db
      .prepare(`SELECT count(*) AS admins FROM "user" WHERE "role" = 'admin' AND "deleted_at" IS NULL`)
      .get()
    const admins =
      isRecord(row) && (typeof row.admins === 'number' || typeof row.admins === 'bigint') ? Number(row.admins) : -1
    if (admins !== 1) {
      throw new Error(`expected exactly 1 admin after seeding, found ${admins}`)
    }
    return 'admin row + blog.general/blog.assets inserted'
  } finally {
    db.close()
  }
}

export function relaxRateLimits(databasePath: string): void {
  const relaxed = {
    ...rateLimitDefaults,
    signIn: { windowSeconds: 60 * 30, maxAttempts: 100 },
    otpSend: { windowSeconds: 60 * 5, maxAttempts: 10 },
    resource: { windowSeconds: 60, maxAttempts: 1000 },
  }
  const db = new DatabaseSync(databasePath)
  try {
    db.prepare(
      `INSERT INTO "setting" ("scope", "data", "updated_at", "updated_by")
       VALUES ('blog.rateLimit', ?, ?, NULL)
       ON CONFLICT ("scope") DO UPDATE SET "data" = excluded."data"`,
    ).run(JSON.stringify(relaxed), Date.now())
  } finally {
    db.close()
  }
}
