import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error.ts'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import { DEFAULT_LOCALE } from '@kobato/i18n/locales.ts'
import { validateCsrfForAction } from '@kobato/server/domains/auth/csrf.ts'
import { signUpAdminSchema } from '@kobato/server/domains/auth/schema.ts'
import { signUpInitialAdminWithSession } from '@kobato/server/domains/auth/services/setup.ts'
import {
  authFlowError,
  authFlowMessage,
  authFlowValidationError,
  type AuthFlowError,
} from '@kobato/server/domains/auth/services/shared.ts'
import { getSetupToken, isSetupTokenActive, verifySetupToken } from '@kobato/server/domains/auth/setup-token.ts'
import { ensureNoAdminOrRedirect } from '@kobato/server/domains/settings/install-gate.ts'
import { getRequestContext } from '@kobato/server/http/request-context.ts'
import { tryKeyedRateLimit } from '@kobato/server/infra/rate-limit.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { AdminInstallForm } from '@kobato/web-admin/ui/auth/AdminInstallForm.tsx'
import { SetupLocaleSelect } from '@kobato/web-admin/ui/auth/SetupLocaleSelect.tsx'
import { SetupTokenVerifyForm } from '@kobato/web-admin/ui/auth/SetupTokenVerifyForm.tsx'
import { BrandLogo } from '@kobato/web-public/ui/chrome/BrandLogo.tsx'
import { useState } from 'react'
import { data, redirect, useNavigation } from 'react-router'

import { titleMeta } from '@/seo/title-meta.ts'

import type { Route } from './+types/index'

const ADMIN_INSTALL_FIELDS = ['title', 'name', 'email', 'password', 'locale'] as const

const SETUP_VERIFY_BUCKET = { windowSeconds: 3600, maxAttempts: 10 }

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  const db = rc.db
  await ensureNoAdminOrRedirect(db)

  try {
    await getSetupToken(db)
  } catch {}

  const { session } = rc
  return data({
    setupTokenVerified: session.get('setupTokenVerified') === true,
    csrfToken: session.get('csrfToken'),
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const rc = getRequestContext({ request, context })
  const db = rc.db
  await ensureNoAdminOrRedirect(db)

  const { session, clientAddress } = rc
  const formData = await request.formData()
  const intent = formData.get('intent')

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

    rc.markSessionDirty()
    return data({ setupTokenVerified: true })
  }

  if (intent === 'install' || intent === null) {
    if (session.get('setupTokenVerified') !== true) {
      return fail('auth.setup.error.tokenNotVerified')
    }

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
