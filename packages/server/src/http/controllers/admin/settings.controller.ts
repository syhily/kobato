import type { SettingsSection } from '@kobato/settings/sections.ts'
import type { BlogSettingsBundle, SettingsBundle } from '@kobato/settings/types.ts'

import { adminSettingsBootstrapOutputSchema } from '@kobato/contracts/admin.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { projectSectionForAdmin } from '@kobato/server/domains/settings/services/admin-projection.ts'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core.ts'
import { backfillSettingsSections, hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { computeSecretMasks, redactSecretsFromBundle } from '@kobato/server/domains/settings/services/masks.ts'
import { getSupportedTimeZones } from '@kobato/server/domains/settings/timezones.ts'
import { isStorageMigrationActive } from '@kobato/server/domains/storage/s3-migration.ts'
import { adminProc, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { SETTINGS_SECTIONS } from '@kobato/settings/sections.ts'
import { safeBigInt } from '@kobato/utils/tools.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { z } from 'zod'

const update = adminProc
  .route({ method: 'POST', path: '/admin/settings/update' })
  .input(
    z.object({
      section: z.enum([...SETTINGS_SECTIONS] as [SettingsSection, ...SettingsSection[]]),
      payload: z.record(z.string(), z.unknown()),
    }),
  )
  // The response is authoritative: the merged, validated section in the admin display shape.
  // The client adopts it for DISPLAY — a save must never refetch the document out from under the
  // user's hands — while its form baseline advances to the submitted values (patches are sparse,
  // so the response also carries fields this card never sent). The REAL runtime gate lives in
  // `projectSectionForAdmin`.
  .output(z.object({ section: z.unknown(), warnings: z.array(z.string()) }))
  .handler(async ({ input, context }) => {
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
const bootstrap = adminProc
  .route({ method: 'GET', path: '/admin/settings/bootstrap' })
  .output(adminSettingsBootstrapOutputSchema)
  .handler(async ({ context }) => {
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

export const adminSettingsRouter = { update, bootstrap }
