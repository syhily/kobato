import type { BlogSettingsBundle } from '@kobato/settings/types'

import { contentBootstrapContract } from '@kobato/api/rpc/public/content'
import { uiMessagesForScope } from '@kobato/i18n/catalog'
import { inklingLabelsFor } from '@kobato/i18n/inkling-labels'
import { resolveFontsForRender } from '@kobato/server/domains/fonts/services/render'
import { getInstallState } from '@kobato/server/domains/settings/install-gate'
import { redactSecretsFromBundle } from '@kobato/server/domains/settings/services/masks'
import { implementPublic } from '@kobato/server/http/orpc-base'
import { activeFrontendRum } from '@kobato/server/infra/trace/config'
import { parseThemeCookie } from '@kobato/utils/theme-cookie'

function projectSettingsForDocument(bundle: BlogSettingsBundle): BlogSettingsBundle {
  return { ...redactSecretsFromBundle(bundle), observability: null }
}

export const contentBootstrap = implementPublic(contentBootstrapContract).bootstrap.handler(
  async ({ input, context }) => {
    const role = context.viewer?.role ?? null
    const csrfToken = context.session.get('csrfToken')
    if (typeof csrfToken !== 'string') {
      throw new TypeError('CSRF token missing from session — session middleware must run before root loader')
    }
    const currentUser =
      context.viewer && role
        ? { id: context.viewer.id, name: context.viewer.name, email: context.viewer.email, role }
        : null

    const rawBundle = context.settings
    const blogSettings = rawBundle ? projectSettingsForDocument(rawBundle) : null

    const fonts = blogSettings?.fonts ? await resolveFontsForRender(context.db, blogSettings.fonts, true) : null

    const theme = parseThemeCookie(context.requestFacts.cookie)

    const { locale, revision } = context.localization
    const scope = input.scope
    const i18n = {
      locale,
      revision,
      messages: uiMessagesForScope(locale, scope),
      ...(scope === 'workspace' && context.viewer !== null ? { inklingLabels: inklingLabelsFor(locale) } : {}),
    }

    return {
      admin: role === 'admin',
      currentUser,
      blogSettings,
      fonts,
      theme,
      csrfToken,
      rum: activeFrontendRum(),
      installState: await getInstallState(context.db),
      i18n,
    }
  },
)
