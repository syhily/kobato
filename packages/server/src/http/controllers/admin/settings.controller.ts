import type { BlogSettingsBundle, SettingsBundle } from '@kobato/settings/types.ts'

import { adminSettingsContract } from '@kobato/api/admin/settings.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { projectSectionForAdmin } from '@kobato/server/domains/settings/services/admin-projection.ts'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core.ts'
import { backfillSettingsSections, hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { computeSecretMasks, redactSecretsFromBundle } from '@kobato/server/domains/settings/services/masks.ts'
import { isStorageMigrationActive } from '@kobato/server/domains/storage/s3-migration.ts'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { safeBigInt } from '@kobato/server/infra/coerce.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { getSupportedTimeZones } from '@kobato/settings/timezones.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'

// Contract-first: method/path/input/output live in
// `@kobato/api/admin/settings.ts`; this controller only implements the
// procedures (admin base). The strict-keyed section merge patch itself is
// unchanged — see `domains/settings`.
const impl = implementAdmin(adminSettingsContract)

const update = impl.update.handler(async ({ input, context }) => {
  const editorId = safeBigInt(context.viewer.id)
  // DomainError translation lives in orpc-base's domainErrorGuard —
  // no per-controller catch here. The lock probe is injected here because
  // domains/settings may not import the storage (Platform) domain.
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
  // Warnings are descriptors in the domain; the wire keeps the client's
  // string contract with server-localized copy.
  const translator = createServerTranslator(context.localization.locale)
  return {
    section: projectSectionForAdmin(input.section, bundle, masks),
    warnings: warnings.map((warning) => translator.format(warning.messageKey, warning.params)),
  }
})

// Settings layout loader data behind `/admin/settings`: hydrate → eager
// backfill → 503 semantics replicated from `layout.tsx` exactly.
const bootstrap = impl.bootstrap.handler(async ({ context }) => {
  const { db } = context
  const bundle = await hydrateBlogSettings(db)
  if (bundle === null) {
    throw localizedOrpcError(context, 'SERVICE_UNAVAILABLE', 'admin.settings.errors.notInstalled')
  }
  // Eager backfill: any section that is null but carries registry
  // defaults gets written to DB and populated in the bundle copy before
  // the missing-section check — matches the layout loader's order.
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
