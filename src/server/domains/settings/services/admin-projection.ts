import type { z } from 'zod'

import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle, SecretMasks } from '@/shared/config/types'

import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { redactSecretsFromBundle } from '@/server/domains/settings/services/masks'
import { DomainError } from '@/server/infra/http/errors'
import {
  assetsLoaderShapeSchema,
  mailLoaderShapeSchema,
  projectAssetsForAdmin,
  projectMailForAdmin,
} from '@/shared/config/projection'
import { SECTION_TO_BUNDLE_KEY } from '@/shared/config/sections'

// Per-section runtime gate for the admin display shape: assets/mail validate against
// their loader-shape Zod twins, every other section against the registry schema.
const SECTION_OUTPUT_SCHEMAS: Partial<Record<SettingsSection, z.ZodType>> = {
  assets: assetsLoaderShapeSchema,
  mail: mailLoaderShapeSchema,
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
    throw new DomainError('INTERNAL', `admin 投影缺少设置区段(${key})`)
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
      apiKeyMask: masks.mailApiKeyMask,
      smtpPassMask: masks.mailSmtpPassMask,
      mailgunApiKeyMask: masks.mailMailgunApiKeyMask,
    })
  } else {
    projected = redacted[SECTION_TO_BUNDLE_KEY[section]]
  }

  const schema = SECTION_OUTPUT_SCHEMAS[section] ?? SECTION_REGISTRY[section].schema
  const result = schema.safeParse(projected)
  if (!result.success) {
    throw new DomainError(
      'INTERNAL',
      `admin 投影形状校验失败(${section}):${result.error.issues[0]?.path.join('.') ?? '<root>'} ${result.error.issues[0]?.message ?? ''}`,
    )
  }
  return result.data
}
