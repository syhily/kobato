import { useState } from 'react'
import { data, redirect, useNavigation } from 'react-router'

import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { validateCsrfForAction } from '@/server/domains/auth/csrf'
import { signUpAdminSchema } from '@/server/domains/auth/schema'
import { signUpInitialAdminWithSession } from '@/server/domains/auth/services/setup'
import {
  authFlowError,
  authFlowMessage,
  authFlowValidationError,
  type AuthFlowError,
} from '@/server/domains/auth/services/shared'
import { getSetupToken, isSetupTokenActive, verifySetupToken } from '@/server/domains/auth/setup-token'
import { ensureNoAdminOrRedirect } from '@/server/domains/settings/install-gate'
import { getRequestContext } from '@/server/http/request-context'
import { tryKeyedRateLimit } from '@/server/infra/rate-limit'
import { DEFAULT_LOCALE } from '@/shared/i18n/locales'
import { titleMeta } from '@/shared/seo/title-meta'
import { AdminInstallForm } from '@/ui/admin/auth/AdminInstallForm'
import { SetupLocaleSelect } from '@/ui/admin/auth/SetupLocaleSelect'
import { SetupTokenVerifyForm } from '@/ui/admin/auth/SetupTokenVerifyForm'
import { useI18n } from '@/ui/lib/I18nProvider'
import { BrandLogo } from '@/ui/public/chrome/BrandLogo'

import type { Route } from './+types/index'

const ADMIN_INSTALL_FIELDS = ['title', 'name', 'email', 'password', 'locale'] as const

const SETUP_VERIFY_BUCKET = { windowSeconds: 3600, maxAttempts: 10 }

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  const db = rc.db
  await ensureNoAdminOrRedirect(db)

  // Re-surface the setup token in the server console on every wizard visit (covers restarts, log rotation).
  try {
    await getSetupToken(db)
  } catch {
    // DB temporarily unreachable; the token is lazily created on the next call.
  }

  const { session } = rc
  return data({
    setupTokenVerified: session.get('setupTokenVerified') === true,
    csrfToken: session.get('csrfToken'),
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const rc = getRequestContext({ request, context })
  const db = rc.db
  // Same gate as the loader; the redirect is a UX courtesy — a racing POST is
  // still caught by `signUpInitialAdminWithSession`'s own `hasAdmin()` (409).
  await ensureNoAdminOrRedirect(db)

  const { session, clientAddress } = rc
  const formData = await request.formData()
  const intent = formData.get('intent')

  // Server translates, client displays: resolve the descriptor for this locale, carry the key for stable branching.
  const failFlow = (flow: AuthFlowError, status?: number) => {
    const payload: {
      error: string
      errorDescriptor?: ErrorMessageDescriptor
    } = {
      error: authFlowMessage(flow.message, flow.descriptor, rc.localization.locale),
      ...(flow.descriptor === undefined ? {} : { errorDescriptor: flow.descriptor }),
    }
    return status === undefined ? data(payload) : data(payload, { status })
  }
  const fail = (messageKey: UiMessageId, status?: number) => failFlow(authFlowError(messageKey), status)

  if (intent === 'verify-token') {
    if (!validateCsrfForAction(session, request, formData)) {
      return fail('error.api.csrfFailed')
    }

    // Rate-limit before any token comparison to slow down automated scanners.
    const { exceeded } = await tryKeyedRateLimit(`rate-limit:setup-verify:${clientAddress}`, SETUP_VERIFY_BUCKET)
    if (exceeded) {
      return fail('auth.setup.error.rateLimited', 429)
    }

    const token = formData.get('setup_token')
    if (typeof token !== 'string' || !token) {
      return fail('auth.setup.error.tokenRequired')
    }

    const isValid = await verifySetupToken(db, token)
    if (!isValid) {
      return fail('auth.setup.error.tokenInvalid')
    }

    session.set('setupTokenVerified', true)
    // Same-session mutation: the request-context middleware emits Set-Cookie after the response resolves.
    rc.markSessionDirty()
    return data({ setupTokenVerified: true })
  }

  // Intent: install; a null intent is treated as install.
  if (intent === 'install' || intent === null) {
    if (session.get('setupTokenVerified') !== true) {
      return fail('auth.setup.error.tokenNotVerified')
    }

    // Defense in depth: a stale session flag must not bypass an expired or invalidated token.
    if (!(await isSetupTokenActive(db))) {
      return fail('auth.setup.error.tokenExpired')
    }

    if (!validateCsrfForAction(session, request, formData)) {
      return fail('error.api.csrfFailed')
    }

    const values: Record<string, FormDataEntryValue | null> = {}
    for (const field of ADMIN_INSTALL_FIELDS) {
      values[field] = formData.get(field)
    }
    values.locale ??= DEFAULT_LOCALE

    const parsed = signUpAdminSchema.safeParse(values)
    if (!parsed.success) {
      // Field rules carry typed catalog ids, so the first failing field's own copy reaches the user; only
      // non-field failures (e.g. a tampered locale enum) fall back to the generic incomplete-form notice.
      return failFlow(authFlowValidationError('auth.setup.error.formIncomplete', parsed.error.issues))
    }

    const result = await signUpInitialAdminWithSession(db, {
      ...parsed.data,
      session,
      request,
      clientAddress,
    })

    if (result.type === 'error') {
      return failFlow(result)
    }

    if (result.type === 'redirect') {
      const headers: Record<string, string> = {}
      if (result.setCookie) {
        headers['Set-Cookie'] = result.setCookie
      }
      return redirect(result.to, { headers })
    }

    // signUpInitialAdminWithSession never returns 'success'; this is defensive.
    return fail('auth.setup.error.unknown')
  }

  return fail('auth.setup.error.unknownAction')
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

      {/* Only the install form's action error — SetupTokenVerifyForm renders its own. */}
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
