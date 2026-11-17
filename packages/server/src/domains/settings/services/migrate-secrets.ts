import { isRecord } from '@kobato/shared/utils/type-guards.ts'

import type { Database } from '../../../infra/db/database'

import { isVitest } from '../../../infra/config'
import { decryptIfNeeded, encryptIfNeeded, isEncrypted } from '../../../infra/crypto/secret-encryption'
import { findSettingsByScopePrefix, upsertSetting } from '../../../infra/db/operations/setting'
import { getLogger } from '../../../infra/logger'
import { SECRET_FIELDS } from '../secrets'
import { SECTION_REGISTRY } from '../sections/registry'

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
          const detail = `[${scope}] ${path}.${field} failed to decrypt — ENCRYPTION_KEY may be incorrect or ciphertext is corrupted`
          log.error('Secret value failed to decrypt', { detail, error })
          failures.push(detail)
        }
      } else {
        try {
          bucket[field] = encryptIfNeeded(value)
          dirtyScopes.add(scope)
          encrypted++
        } catch (error) {
          const detail = `[${scope}] ${path}.${field} failed to encrypt`
          log.error('Secret value failed to encrypt', { detail, error })
          failures.push(detail)
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
      log.info('Secrets encryption migration complete', { encrypted, verified })
    }
  } catch (error) {
    log.error('Secrets encryption migration failed', { error })
    throw error
  }
}
