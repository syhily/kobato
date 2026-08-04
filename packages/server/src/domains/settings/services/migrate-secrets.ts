import type { Database } from '@kobato/server/infra/db/database'

import { SECRET_FIELDS } from '@kobato/server/domains/settings/secrets'
import { SECTION_REGISTRY } from '@kobato/server/domains/settings/sections/registry'
import { isVitest } from '@kobato/server/infra/config'
import { decryptIfNeeded, encryptIfNeeded, isEncrypted } from '@kobato/server/infra/crypto/secret-encryption'
import { findSettingsByScopePrefix, upsertSetting } from '@kobato/server/infra/db/operations/setting'
import { getLogger } from '@kobato/server/infra/logger'
import { isRecord } from '@kobato/shared/utils/type-guards'

const log = getLogger('settings.migrate-secrets')

export async function migrateSecretsEncryption(db: Database): Promise<void> {
  if (isVitest()) {
    return
  }

  try {
    const rows = findSettingsByScopePrefix(db, 'blog.')
    const byScope = new Map<string, Record<string, unknown>>()
    for (const r of rows) {
      if (isRecord(r.data)) {
        byScope.set(r.scope, r.data)
      }
    }

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

      const bucket = data[path]
      if (!isRecord(bucket)) {
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
      const data = byScope.get(scope)
      if (data) {
        upsertSetting(db, data, null, scope)
      }
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
