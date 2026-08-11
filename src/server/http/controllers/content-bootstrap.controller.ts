import { resolveFontsForRender } from '@/server/domains/fonts/services/render'
import { redactSecretsFromBundle } from '@/server/domains/settings/services/masks'
import { publicProc } from '@/server/http/orpc-base'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { contentBootstrapOutputSchema } from '@/shared/contracts/content'
import { parseThemeCookie } from '@/shared/utils/theme-cookie'

// The root loader's data segment (public AND admin): redacted settings
// bundle, fonts, theme, CSRF token. No input — theme parsed from the cookie.
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

    const rawBundle = getBlogSettingsBundleSync()
    const blogSettings = rawBundle ? redactSecretsFromBundle(rawBundle) : null

    // Resolve the configured font-id slots into browser-ready {family, href}
    // lists so `<head>` can emit one self-hosted `<link>` per font without a
    // second round-trip. `context.db` is read lazily so a missing bundle
    // never touches the request db.
    const fonts = blogSettings?.fonts ? await resolveFontsForRender(context.db, blogSettings.fonts, true) : null

    const theme = parseThemeCookie(context.requestFacts.cookie)

    return { admin: role === 'admin', currentUser, blogSettings, fonts, theme, csrfToken }
  })
