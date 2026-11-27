import type { AuthFlowOutput } from '@kobato/api/contracts/account/auth'
import type { SetupVerifyTokenOutput } from '@kobato/api/contracts/account/setup'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { orpc } from '@kobato/api/browser/client'
import { DEFAULT_LOCALE } from '@kobato/i18n/locales'
import { BrandLogo } from '@kobato/ui/components/BrandLogo'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import {
  authErrorPayload,
  clientAuthFlowError,
  isCsrfFailure,
  toClientActionResult,
  type ClientI18nCatalog,
} from '@kobato/web-admin/lib/client-action-result'
import { awaitRootBootstrap } from '@kobato/web-admin/lib/root-bootstrap'
import { formField, formOptionalField } from '@kobato/web-admin/routes/auth/flow-response'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { AdminInstallForm } from '@kobato/web-admin/ui/auth/AdminInstallForm'
import { SetupLocaleSelect } from '@kobato/web-admin/ui/auth/SetupLocaleSelect'
import { SetupTokenVerifyForm } from '@kobato/web-admin/ui/auth/SetupTokenVerifyForm'
import { useState } from 'react'
import { data, redirect, useNavigation } from 'react-router'

import type { Route } from './+types/index'

function fail(messageKey: UiMessageId, catalog: ClientI18nCatalog) {
  return toClientActionResult(clientAuthFlowError(messageKey), catalog)
}

export async function clientLoader() {
  const boot = await awaitRootBootstrap()
  if (boot.installState === 'installed') {
    throw redirect('/admin/signin', { status: 303 })
  }
  const status = await orpc.account.setup.status({})
  return data({
    setupTokenVerified: status.setupTokenVerified,
    csrfToken: status.csrfToken ?? undefined,
  })
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const boot = await awaitRootBootstrap()
  const catalog: ClientI18nCatalog = { locale: boot.i18n.locale, messages: boot.i18n.messages }
  if (boot.installState === 'installed') {
    throw redirect('/admin/signin', { status: 303 })
  }

  const formData = await request.formData()
  const intent = formData.get('intent')

  if (intent === 'verify-token') {
    let result: SetupVerifyTokenOutput
    try {
      result = await orpc.account.setup.verifyToken({ token: formField(formData, 'setup_token') })
    } catch (error) {
      if (!isCsrfFailure(error)) {
        throw error
      }
      return fail('error.api.csrfFailed', catalog)
    }
    if (result.kind === 'verified') {
      return data({ setupTokenVerified: true })
    }
    return data(
      authErrorPayload(result.message, result.descriptor, catalog),
      result.status === undefined ? undefined : { status: result.status },
    )
  }

  if (intent === 'install' || intent === null) {
    let result: AuthFlowOutput
    try {
      result = await orpc.account.setup.install({
        title: formField(formData, 'title'),
        name: formField(formData, 'name'),
        email: formField(formData, 'email'),
        password: formField(formData, 'password'),
        locale: formOptionalField(formData, 'locale'),
      })
    } catch (error) {
      if (!isCsrfFailure(error)) {
        throw error
      }
      return fail('error.api.csrfFailed', catalog)
    }

    if (result.type === 'success') {
      return fail('auth.setup.error.unknown', catalog)
    }
    if (result.type === 'redirect') {
      throw redirect(result.to)
    }
    return data(authErrorPayload(result.message, result.descriptor, catalog))
  }

  return fail('auth.setup.error.unknownAction', catalog)
}

export const meta = titleMeta('meta.title.auth.setup')

function actionError(actionData: unknown): { error: string } | null {
  if (
    typeof actionData === 'object' &&
    actionData !== null &&
    'error' in actionData &&
    typeof actionData.error === 'string'
  ) {
    return { error: actionData.error }
  }
  return null
}

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

      {actionError(actionData) !== null && loaderData.setupTokenVerified ? (
        <div role="alert" aria-live="polite" className="text-center text-sm leading-relaxed text-destructive">
          {actionError(actionData)?.error}
        </div>
      ) : null}

      {!loaderData.setupTokenVerified ? (
        <SetupTokenVerifyForm isSubmitting={isSubmitting} csrfToken={csrfToken} actionData={actionError(actionData)} />
      ) : (
        <AdminInstallForm locale={locale} />
      )}
    </div>
  )
}
