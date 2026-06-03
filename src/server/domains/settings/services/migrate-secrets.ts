import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { decryptIfNeeded, encryptIfNeeded, isEncrypted } from '@/server/infra/crypto/secret-encryption'
import { findSettingsByScopePrefix, upsertSetting } from '@/server/infra/db/operations/setting'
import { ENCRYPTION_KEY, IGNORE_ENCRYPTION_WARNING, isVitest } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('settings.migrate-secrets')

export async function migrateSecretsEncryption(db: NodePgDatabase): Promise<void> {
  if (isVitest()) {
    return
  }

  if (!ENCRYPTION_KEY) {
    log.warn(
      'ENCRYPTION_KEY is not set. API keys and S3 credentials will be stored as plaintext in the database. ' +
        'Set ENCRYPTION_KEY to enable automatic encryption on next startup.',
    )

    const rows = await findSettingsByScopePrefix(db, 'blog.')
    const byScope = new Map(rows.map((r) => [r.scope, r.data as Record<string, unknown>]))
    let encryptedCount = 0
    let plaintextCount = 0
    for (const { section, path, field } of SECRET_FIELDS) {
      const scope = SECTION_REGISTRY[section].scope
      const bucket = byScope.get(scope)?.[path] as Record<string, unknown> | undefined
      const value = bucket?.[field]
      if (typeof value === 'string' && isEncrypted(value)) {
        encryptedCount++
      } else if (typeof value === 'string' && value !== '') {
        plaintextCount++
      }
    }
    if (encryptedCount > 0) {
      log.fatal(
        `${encryptedCount} encrypted secret(s) found in the database but ENCRYPTION_KEY is not set. ` +
          'The app will crash at runtime when these secrets are read. ' +
          'Set ENCRYPTION_KEY or set IGNORE_ENCRYPTION_WARNING=1 to acknowledge the risk.',
      )
      if (IGNORE_ENCRYPTION_WARNING !== '1') {
        process.exit(1)
      }
    }
    if (plaintextCount > 0) {
      log.error(
        `${plaintextCount} plaintext secret(s) found in the database and ENCRYPTION_KEY is not set. ` +
          'Secrets will remain readable by anyone with database access.',
      )
    }
    return
  }

  try {
    const rows = await findSettingsByScopePrefix(db, 'blog.')
    const byScope = new Map(rows.map((r) => [r.scope, r.data as Record<string, unknown>]))

    let encrypted = 0
    let verified = 0
    const dirtyScopes = new Set<string>()
    const failures: string[] = []

    for (const { section, path, field } of SECRET_FIELDS) {
      const scope = SECTION_REGISTRY[section].scope
      const data = byScope.get(scope)
      if (!data) {
        continue
      }

      const bucket = data[path] as Record<string, unknown> | undefined
      if (!bucket) {
        continue
      }

      const value = bucket[field]
      if (typeof value !== 'string' || value === '') {
        continue
      }

      if (isEncrypted(value)) {
        try {
          decryptIfNeeded(value)
          verified++
        } catch (error) {
          const msg = `[${scope}] ${path}.${field} failed to decrypt — ENCRYPTION_KEY may be incorrect or ciphertext is corrupted`
          log.error(msg, { error })
          failures.push(msg)
        }
      } else {
        try {
          bucket[field] = encryptIfNeeded(value)
          dirtyScopes.add(scope)
          encrypted++
        } catch (error) {
          const msg = `[${scope}] ${path}.${field} failed to encrypt`
          log.error(msg, { error })
          failures.push(msg)
        }
      }
    }

    for (const scope of dirtyScopes) {
      await upsertSetting(db, byScope.get(scope)!, null, scope)
    }

    if (failures.length > 0) {
      throw new Error(
        `Secrets encryption migration aborted — ${failures.length} secret(s) failed. ` +
          'Ensure ENCRYPTION_KEY is correct and secrets are not corrupted.',
      )
    }

    if (encrypted > 0 || verified > 0) {
      log.info(`Secrets migration complete: ${encrypted} encrypted, ${verified} verified`)
    }
  } catch (error) {
    log.error('Secrets encryption migration failed', { error })
    throw error
  }
}
