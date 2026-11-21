import type { BlogSettingsBundle, SettingsBundle } from '@kobato/settings/types'

import { adminSettingsContract } from '@kobato/api/admin/settings'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { projectSectionForAdmin } from '@kobato/server/domains/settings/services/admin-projection'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core'
import { backfillSettingsSections, hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { computeSecretMasks, redactSecretsFromBundle } from '@kobato/server/domains/settings/services/masks'
import { isStorageMigrationActive } from '@kobato/server/domains/storage/s3-migration'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base'
import { safeBigInt } from '@kobato/server/infra/coerce'
import { createServerTranslator } from '@kobato/server/infra/i18n'
import { getSupportedTimeZones } from '@kobato/settings/timezones'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

const impl = implementAdmin(adminSettingsContract)

const update = impl.update.handler(async ({ input, context }) => {
  const editorId = safeBigInt(context.viewer.id)
  const { bundle, warnings } = await updateBlogSettingsSection(context.db, input.section, input.payload, editorId, {
    isStorageMigrationActive: () => isStorageMigrationActive(context.db),
  })
  recordAuditEventFromContext(context, {
    action: 'settings_updated',
    resourceType: 'setting',
    resourceId: input.section,
    details: { section: input.section },
  })
  if (bundle === null) {
    throw localizedOrpcError(context, 'INTERNAL_SERVER_ERROR', 'admin.settings.errors.saveReadFailed')
  }
  const masks = computeSecretMasks(bundle)
  const translator = createServerTranslator(context.localization.locale)
  return {
    section: projectSectionForAdmin(input.section, bundle, masks),
    warnings: warnings.map((warning) => translator.format(warning.messageKey, warning.params)),
  }
})

const bootstrap = impl.bootstrap.handler(async ({ context }) => {
  const { db } = context
  const bundle = await hydrateBlogSettings(db)
  if (bundle === null) {
    throw localizedOrpcError(context, 'SERVICE_UNAVAILABLE', 'admin.settings.errors.notInstalled')
  }
  const mutable = await backfillSettingsSections(db, bundle)
  const missing = Object.entries(mutable)
    .filter(([, value]) => value === null)
    .map(([key]) => key)
  if (missing.length > 0) {
    throw localizedOrpcError(context, 'SERVICE_UNAVAILABLE', 'admin.settings.errors.incompleteSections', {
      sections: missing.join(', '),
    })
  }
  const masks = computeSecretMasks(unsafeCast<BlogSettingsBundle>(mutable))
  const redacted = unsafeCast<SettingsBundle>(redactSecretsFromBundle(unsafeCast<BlogSettingsBundle>(mutable)))
  return { bundle: redacted, timeZones: getSupportedTimeZones(), masks }
})

export const adminSettingsRouter = impl.router({ update, bootstrap })
