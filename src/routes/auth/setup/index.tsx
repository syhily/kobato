import { data, redirect } from 'react-router'

import { getDbFromContext, getPoolFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { validateCsrfForAction } from '@/server/domains/auth/csrf'
import { signUpInitialAdminWithSession } from '@/server/domains/auth/flows'
import { signUpAdminSchema } from '@/server/domains/auth/schema'
import { getSetupToken } from '@/server/domains/auth/setup-token'
import { checkPgToolsAvailable } from '@/server/domains/backup/services/shared'
import { ensureNoAdminOrRedirect } from '@/server/domains/settings/install-gate'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { AdminInstallForm } from '@/ui/admin/auth/AdminInstallForm'
import { BrandLogo } from '@/ui/public/chrome/BrandLogo'

import type { Route } from './+types/index'

const ADMIN_INSTALL_FIELDS = ['title', 'name', 'email', 'password'] as const

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = getDbFromContext({ request, context })
  // Possible outcomes:
  //   noAdmin   → render the admin-credentials form.
  //   installed → 303 → /admin/signin
  await ensureNoAdminOrRedirect(db)

  // Pull the request context so we trip session middleware exactly once.
  getRouteRequestContext({ request, context })
  return data({
    pgToolsAvailable: await checkPgToolsAvailable(),
    setupToken: await getSetupToken(),
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const db = getDbFromContext({ request, context })
  const pool = getPoolFromContext({ request, context })
  // Same gate as the loader. A POST that races a concurrent install
  // would still be caught by `signUpInitialAdminWithSession`'s own
  // `hasAdmin()` check (returns 409), so the redirect here is a UX
  // courtesy, not a security boundary.
  await ensureNoAdminOrRedirect(db)

  const { session, clientAddress } = getRouteRequestContext({ request, context })

  // CSRF guard for the setup form action.
  const formData = await request.formData()
  if (!validateCsrfForAction(session, request, formData)) {
    return data({ error: '安全校验失败，请刷新页面后重试。' })
  }

  const values: Record<string, FormDataEntryValue | null> = {}
  for (const field of ADMIN_INSTALL_FIELDS) {
    values[field] = formData.get(field)
  }

  const parsed = signUpAdminSchema.safeParse(values)
  if (!parsed.success) {
    return data({ error: '请填写完整的管理员账号信息。' })
  }

  const result = await signUpInitialAdminWithSession(db, pool, {
    ...parsed.data,
    session,
    request,
    clientAddress,
  })

  if (result.type === 'error') {
    return data({ error: result.message })
  }

  if (result.type === 'redirect') {
    const headers: Record<string, string> = {}
    if (result.setCookie) {
      headers['Set-Cookie'] = result.setCookie
    }
    return redirect(result.to, { headers })
  }

  // signUpInitialAdminWithSession never returns 'success'; this is defensive.
  return data({ error: '未知错误' })
}

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '创建站点' }, bundleFromMatches(matches))
}

export default function AdminInstallRoute({ actionData, loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-8">
      {/* Ghost-style welcome header */}
      <header className="text-center">
        <BrandLogo className="mx-auto mb-10 h-20 w-auto" />
        <p className="text-base text-muted-foreground md:text-lg">填写以下信息，开启你的创作之旅。</p>
      </header>

      {/* Error message — centered, Ghost-style */}
      {actionData?.error ? (
        <div role="alert" aria-live="polite" className="text-center text-sm leading-relaxed text-destructive">
          {actionData.error}
        </div>
      ) : null}

      <AdminInstallForm pgToolsAvailable={loaderData.pgToolsAvailable} setupToken={loaderData.setupToken} />
    </div>
  )
}
