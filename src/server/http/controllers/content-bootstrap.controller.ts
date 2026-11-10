import type { BlogSettingsBundle } from '@/shared/config/types'

import { resolveFontsForRender } from '@/server/domains/fonts/services/render'
import { redactSecretsFromBundle } from '@/server/domains/settings/services/masks'
import { publicProc } from '@/server/http/orpc-base'
import { contentBootstrapOutputSchema } from '@/shared/contracts/content'
import { uiMessagesForScope } from '@/shared/i18n/catalog'
import { catalogScopeForPathname } from '@/shared/i18n/catalog-scope'
import { inklingLabelsFor } from '@/shared/i18n/inkling-labels'
import { parseThemeCookie } from '@/shared/utils/theme-cookie'

/**
 * The document-scope settings projection: redacted secrets, and the
 * admin-only `observability` section dropped. A public document has no reason
 * to ship the OpenObserve endpoint/organization/username or the two
 * verification fingerprints to every anonymous visitor; the admin settings
 * page reads its own `admin.settings.bootstrap` payload.
 */
function projectSettingsForDocument(bundle: BlogSettingsBundle): BlogSettingsBundle {
  return { ...redactSecretsFromBundle(bundle), observability: null }
}

// The root loader's data segment (public AND admin): redacted settings
// bundle, fonts, theme, CSRF token, and the CURRENT locale's UI messages for
// the document's scope (`/admin` + `/editor` get the full catalog and the
// Inkling label table; public documents get neither). No input — the theme is
// parsed from the cookie and the scope from the request pathname.
export const contentBootstrap = publicProc
  .route({ method: 'GET', path: '/content/bootstrap' })
  .output(contentBootstrapOutputSchema)
  .handler(async ({ context }) => {
    const role = context.viewer?.role ?? null
    const csrfToken = context.session.get('csrfToken')
    if (typeof csrfToken !== 'string') {
      throw new TypeError('CSRF token missing from session — session middleware must run before root loader')
    }
    const currentUser = context.viewer && role ? { id: context.viewer.id, name: context.viewer.name, role } : null

    // The request's PINNED bundle — the same capture that produced
    // `context.localization`, so the shipped locale and the settings payload
    // can never come from two different snapshots.
    const rawBundle = context.settings
    const blogSettings = rawBundle ? projectSettingsForDocument(rawBundle) : null

    // Resolve the configured font-id slots into browser-ready {family, href}
    // lists so `<head>` can emit one self-hosted `<link>` per font without a
    // second round-trip. `context.db` is read lazily so a missing bundle
    // never touches the request db.
    const fonts = blogSettings?.fonts ? await resolveFontsForRender(context.db, blogSettings.fonts, true) : null

    const theme = parseThemeCookie(context.requestFacts.cookie)

    // The UI catalog is resolved HERE (server side) and shipped as data; the
    // root layout and the editor composer must never value-import the catalog
    // module (that is what would pull all four locales into the browser). The
    // scope comes from the document pathname: public pages get the allowlisted
    // public namespaces, workspace pages the complete catalog.
    //
    // The Inkling label table is EDITOR chrome: only a signed-in workspace
    // document gets it. `/admin/signin` + `/admin/setup` need the full catalog
    // (auth copy) but have no editor and no session yet, and public documents
    // load the active locale's chunk on demand.
    const { locale, revision } = context.localization
    const scope = catalogScopeForPathname(context.requestFacts.path)
    const i18n = {
      locale,
      revision,
      messages: uiMessagesForScope(locale, scope),
      ...(scope === 'workspace' && context.viewer !== null ? { inklingLabels: inklingLabelsFor(locale) } : {}),
    }

    return { admin: role === 'admin', currentUser, blogSettings, fonts, theme, csrfToken, i18n }
  })
