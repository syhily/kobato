import type { AppLocale } from '@kobato/i18n/locales'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { DEFAULT_LOCALE } from '@kobato/i18n/locales'
import { validateCsrfForAction } from '@kobato/server/domains/auth/csrf'
import { authFlowError } from '@kobato/server/domains/auth/services/shared'
import { ensureNoAdminOrRedirect } from '@kobato/server/domains/settings/install-gate'
import { getRequestContext } from '@kobato/server/http/request-context'
import { createSsrCaller } from '@kobato/server/http/ssr-caller'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { AdminInstallForm } from '@kobato/web-admin/ui/auth/AdminInstallForm'
import { SetupLocaleSelect } from '@kobato/web-admin/ui/auth/SetupLocaleSelect'
import { SetupTokenVerifyForm } from '@kobato/web-admin/ui/auth/SetupTokenVerifyForm'
import { BrandLogo } from '@kobato/web-public/ui/chrome/BrandLogo'
import { useState } from 'react'
import { data, redirect, useNavigation } from 'react-router'

import { authErrorPayload, cookieHeaders, formField, formOptionalField } from '@/routes/auth/flow-response'
import { titleMeta } from '@/seo/title-meta'

import type { Route } from './+types/index'

function fail(messageKey: UiMessageId, locale: AppLocale) {
  const flow = authFlowError(messageKey)
  return data(authErrorPayload(flow.message, flow.descriptor, locale))
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  await ensureNoAdminOrRedirect(rc.db)

  const { caller } = createSsrCaller({ request, context })
  const status = await caller.account.setup.status({})
  return data({
    setupTokenVerified: status.setupTokenVerified,
    csrfToken: status.csrfToken ?? undefined,
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const rc = getRequestContext({ request, context })
  await ensureNoAdminOrRedirect(rc.db)

  const { caller, responseHeaders } = createSsrCaller({ request, context })
  const { session } = rc
  const locale = rc.localization.locale
  const formData = await request.formData()
  const intent = formData.get('intent')

  if (intent === 'verify-token') {
    if (!validateCsrfForAction(session, request, formData)) {
      return fail('error.api.csrfFailed', locale)
    }

    const result = await caller.account.setup.verifyToken({ token: formField(formData, 'setup_token') })
    if (result.kind === 'verified') {
      return data({ setupTokenVerified: true })
    }
    return data(
      authErrorPayload(result.message, result.descriptor, locale),
      result.status === undefined ? undefined : { status: result.status },
    )
  }

  if (intent === 'install' || intent === null) {
    if (session.get('setupTokenVerified') !== true) {
      return fail('auth.setup.error.tokenNotVerified', locale)
    }

    if (!validateCsrfForAction(session, request, formData)) {
      return fail('error.api.csrfFailed', locale)
    }

    const result = await caller.account.setup.install({
      title: formField(formData, 'title'),
      name: formField(formData, 'name'),
      email: formField(formData, 'email'),
      password: formField(formData, 'password'),
      locale: formOptionalField(formData, 'locale'),
    })

    if (result.type === 'success') {
      return fail('auth.setup.error.unknown', locale)
    }
    if (result.type === 'redirect') {
      return redirect(result.to, { headers: cookieHeaders(responseHeaders) })
    }
    return data(authErrorPayload(result.message, result.descriptor, locale), {
      headers: cookieHeaders(responseHeaders),
    })
  }

  return fail('auth.setup.error.unknownAction', locale)
}

export const meta = titleMeta('meta.title.auth.setup')

export default function AdminInstallRoute({ actionData, loaderData }: Route.ComponentProps) {
  const { t } = useI18n()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting' && navigation.formMethod === 'POST'
  const csrfToken = loaderData.csrfToken
  const [locale, setLocale] = useState(DEFAULT_LOCALE)

  return (
    <div className="flex flex-col gap-8">
      <header className="text-center">
        <BrandLogo className="mx-auto mb-10 h-20 w-auto" alt="" />
        {!loaderData.setupTokenVerified ? (
          <p className="text-base text-muted-foreground md:text-lg">{t('auth.setup.tokenHint')}</p>
        ) : (
          <p className="text-base text-muted-foreground md:text-lg">{t('auth.setup.intro')}</p>
        )}
      </header>

      <SetupLocaleSelect value={locale} onValueChange={setLocale} disabled={isSubmitting} />

      {loaderData.setupTokenVerified && actionData && 'error' in actionData && actionData.error ? (
        <div role="alert" aria-live="polite" className="text-center text-sm leading-relaxed text-destructive">
          {actionData.error}
        </div>
      ) : null}

      {!loaderData.setupTokenVerified ? (
        <SetupTokenVerifyForm isSubmitting={isSubmitting} csrfToken={csrfToken} actionData={actionData} />
      ) : (
        <AdminInstallForm locale={locale} />
      )}
    </div>
  )
}
