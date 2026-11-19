import type { SettingsSection } from '@kobato/settings/sections.ts'
import type { BlogSettingsBundle, SecretMasks } from '@kobato/settings/types.ts'
import type { z } from 'zod'

import { redactSecretsFromBundle } from '@kobato/server/domains/settings/services/masks.ts'
import { messageDescriptor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import {
  assetsLoaderShapeSchema,
  backupLoaderShapeSchema,
  commentsLoaderShapeSchema,
  mailLoaderShapeSchema,
  projectAssetsForAdmin,
  projectBackupForAdmin,
  projectCommentsForAdmin,
  projectMailForAdmin,
} from '@kobato/settings/projection.ts'
import { SECTION_TO_BUNDLE_KEY } from '@kobato/settings/sections.ts'
import { SECTION_REGISTRY } from '@kobato/settings/sections/registry.ts'

const SECTION_OUTPUT_SCHEMAS: Partial<Record<SettingsSection, z.ZodType>> = {
  assets: assetsLoaderShapeSchema,
  mail: mailLoaderShapeSchema,
  comments: commentsLoaderShapeSchema,
  backup: backupLoaderShapeSchema,
}

/**
 * Read a bundle slot that must be populated — a null here means the snapshot is broken,
 * surfaced as INTERNAL instead of an untyped property-access crash.
 */
function requireBundleSection<K extends keyof BlogSettingsBundle>(
  bundle: BlogSettingsBundle,
  key: K,
): NonNullable<BlogSettingsBundle[K]> {
  const value = bundle[key]
  if (value === null) {
    throw new DomainError('INTERNAL', `admin projection is missing the settings section (${key})`)
  }
  return value
}

/**
 * Project a fresh-bundle section into the admin display shape the settings cards expect;
 * the update endpoint returns this so the client adopts the save response as its baseline.
 */
export function projectSectionForAdmin(
  section: SettingsSection,
  bundle: BlogSettingsBundle,
  masks: SecretMasks,
): unknown {
  const redacted = redactSecretsFromBundle(bundle)
  let projected: unknown
  if (section === 'assets') {
    projected = projectAssetsForAdmin(requireBundleSection(redacted, 'assets'), masks.assetsSecretAccessKeyMask)
  } else if (section === 'mail') {
    projected = projectMailForAdmin(requireBundleSection(redacted, 'mail'), {
      smtpPassMask: masks.mailSmtpPassMask,
      mailgunApiKeyMask: masks.mailMailgunApiKeyMask,
    })
  } else if (section === 'comments') {
    projected = projectCommentsForAdmin(requireBundleSection(redacted, 'comments'), masks.commentsGithubTokenMask)
  } else if (section === 'backup') {
    projected = projectBackupForAdmin(requireBundleSection(redacted, 'backup'), masks.backupEncryptionPasswordMask)
  } else {
    projected = redacted[SECTION_TO_BUNDLE_KEY[section]]
  }

  const schema = SECTION_OUTPUT_SCHEMAS[section] ?? SECTION_REGISTRY[section].schema
  const result = schema.safeParse(projected)
  if (!result.success) {
    // Technical invariant failure: keep the message English and resolve a
    // typed issue message to its English fallback (never a raw catalog id).
    const first = result.error.issues[0]
    const issueText = first === undefined ? '' : messageDescriptor(first.message).fallbackMessage
    throw new DomainError(
      'INTERNAL',
      `admin projection shape validation failed (${section}): ${first?.path.join('.') ?? '<root>'} ${issueText}`,
    )
  }
  return result.data
}
