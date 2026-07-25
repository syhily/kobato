import { data, redirect, useNavigation } from 'react-router'

import { getDbFromContext, getPoolFromContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { validateCsrfForAction } from '@/server/domains/auth/csrf'
import { signUpAdminSchema } from '@/server/domains/auth/schema'
import { commitSessionWithMaxAge } from '@/server/domains/auth/session-storage'
import { getSetupToken, isSetupTokenActive, verifySetupToken } from '@/server/domains/auth/setup-token'
import { signUpInitialAdminWithSession } from '@/server/domains/auth/signin-flow'
import { checkPgToolsAvailable } from '@/server/domains/backup/services/shared'
import { ensureNoAdminOrRedirect } from '@/server/domains/settings/install-gate'
import { tryKeyedRateLimit } from '@/server/infra/rate-limit'
import { titleMeta } from '@/shared/seo/title-meta'
import { AdminInstallForm } from '@/ui/admin/auth/AdminInstallForm'
import { SetupTokenVerifyForm } from '@/ui/admin/auth/SetupTokenVerifyForm'
import { BrandLogo } from '@/ui/public/chrome/BrandLogo'

import type { Route } from './+types/index'

const ADMIN_INSTALL_FIELDS = ['title', 'name', 'email', 'password'] as const

const SETUP_VERIFY_BUCKET = { windowSeconds: 3600, maxAttempts: 10 }

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = getDbFromContext({ request, context })
  // Possible outcomes:
  //   noAdmin   → render the admin-credentials form.
  //   installed → 303 → /admin/signin
  await ensureNoAdminOrRedirect(db)

  // Ensure the setup token is visible in the server console whenever the
  // install wizard is visited (covers restarts, log rotation, etc.).
  try {
    await getSetupToken(db)
  } catch {
    // The database may be temporarily unreachable; the token will be
    // lazily created on the next successful call.
  }

  // Pull the request context so we trip session middleware exactly once.
  const { session } = getRouteRequestContext({ request, context })
  return data({
    pgToolsAvailable: await checkPgToolsAvailable(),
    setupTokenVerified: session.get('setupTokenVerified') === true,
    csrfToken: session.get('csrfToken'),
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
  const formData = await request.formData()
  const intent = formData.get('intent')

  // ── Intent: verify-token ───────────────────────────────────────────────
  if (intent === 'verify-token') {
    // CSRF guard for the setup token verification form.
    if (!validateCsrfForAction(session, request, formData)) {
      return data({ error: '安全校验失败，请刷新页面后重试。' })
    }

    // Rate-limit before any token comparison to slow down automated scanners.
    const { exceeded } = await tryKeyedRateLimit(`rate-limit:setup-verify:${clientAddress}`, SETUP_VERIFY_BUCKET)
    if (exceeded) {
      return data({ error: '请求过于频繁，请稍后再试。' }, { status: 429 })
    }

    const token = formData.get('setup_token')
    if (typeof token !== 'string' || !token) {
      return data({ error: '请输入 Setup Token。' })
    }

    const isValid = await verifySetupToken(db, token)
    if (!isValid) {
      return data({ error: 'Setup Token 错误，请查看服务器控制台输出。' })
    }

    session.set('setupTokenVerified', true)
    // Manually commit the session here. React Router actions run inside
    // Hono's `next()` so they cannot set `c.var.sessionDirty`. The Hono
    // session middleware will also commit after `next()` returns when
    // `sessionDirty` is true (e.g. for a fresh session that just got its
    // CSRF token). This produces two Set-Cookie headers with equivalent
    // content; browsers handle it correctly. The same pattern exists in
    // `signin.tsx`.
    return data({ setupTokenVerified: true }, { headers: { 'Set-Cookie': await commitSessionWithMaxAge(session) } })
  }

  // ── Intent: install (or no intent for backward compat) ─────────────────
  if (intent === 'install' || intent === null) {
    if (session.get('setupTokenVerified') !== true) {
      return data({ error: '请先验证 Setup Token。' })
    }

    // Defense in depth: a stale session flag must not bypass a token that
    // has expired or been invalidated.
    if (!(await isSetupTokenActive(db))) {
      return data({ error: 'Setup Token 已过期或失效，请重新验证。' })
    }

    // CSRF guard for the setup form action.
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

  return data({ error: '未知操作。' })
}

export const meta = titleMeta('创建站点')

export default function AdminInstallRoute({ actionData, loaderData }: Route.ComponentProps) {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting' && navigation.formMethod === 'POST'
  const csrfToken = loaderData.csrfToken

  return (
    <div className="flex flex-col gap-8">
      {/* Ghost-style welcome header */}
      <header className="text-center">
        <BrandLogo className="mx-auto mb-10 h-20 w-auto" />
        {!loaderData.setupTokenVerified ? (
          <p className="text-base text-muted-foreground md:text-lg">验证 Setup Token 以继续。</p>
        ) : (
          <p className="text-base text-muted-foreground md:text-lg">填写以下信息，开启你的创作之旅。</p>
        )}
      </header>

      {/* Error message for install action — centered, Ghost-style.
          SetupTokenVerifyForm renders its own errors, so we only show
          this block when the install form is visible. */}
      {loaderData.setupTokenVerified && actionData && 'error' in actionData && actionData.error ? (
        <div role="alert" aria-live="polite" className="text-center text-sm leading-relaxed text-destructive">
          {actionData.error}
        </div>
      ) : null}

      {!loaderData.setupTokenVerified ? (
        <SetupTokenVerifyForm isSubmitting={isSubmitting} csrfToken={csrfToken} actionData={actionData} />
      ) : (
        <AdminInstallForm pgToolsAvailable={loaderData.pgToolsAvailable} />
      )}
    </div>
  )
}
