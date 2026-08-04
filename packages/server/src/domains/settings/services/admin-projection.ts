import type { SettingsSection } from '@kobato/shared/config/sections'
import type { BlogSettingsBundle, SecretMasks } from '@kobato/shared/config/types'
import type { z } from 'zod'

import { SECTION_REGISTRY } from '@kobato/server/domains/settings/sections/registry'
import { redactSecretsFromBundle } from '@kobato/server/domains/settings/services/masks'
import { DomainError } from '@kobato/server/infra/http/errors'
import {
  assetsLoaderShapeSchema,
  mailLoaderShapeSchema,
  projectAssetsForAdmin,
  projectMailForAdmin,
} from '@kobato/shared/config/projection'
import { SECTION_TO_BUNDLE_KEY } from '@kobato/shared/config/sections'

// Per-section runtime gate for the admin display shape: the three masked
// sections validate against their loader-shape Zod twins, every other
// section against the registry schema (its stored shape IS the admin
// shape there). A drifting projection fails HERE — loudly, at the
// assembly point — instead of silently mistyping the save response.
const SECTION_OUTPUT_SCHEMAS: Partial<Record<SettingsSection, z.ZodType>> = {
  assets: assetsLoaderShapeSchema,
  mail: mailLoaderShapeSchema,
}

/**
 * Read a bundle slot that the projection requires to be populated. The
 * save path projects the section it has just written onto a freshly
 * refreshed bundle, so a null here means the snapshot itself is broken —
 * surface it as the same INTERNAL class the shape gate uses instead of an
 * untyped property-access crash.
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
 * Project one section of a fresh bundle into the admin display shape the
 * settings cards expect — the exact TSource contract the layout loader +
 * `routes/admin/settings/index.tsx` produce (assets/mail/search get their
 * masks merged in; every other section is the redacted bundle slice). The
 * update endpoint returns this so the client can adopt the save response
 * as its new baseline instead of revalidating the loader.
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
