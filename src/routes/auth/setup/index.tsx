import { data } from 'react-router'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { processAuthFormSubmission, signUpInitialAdminWithSession } from '@/server/domains/auth/flows'
import { signUpAdminSchema } from '@/server/domains/auth/schema'
import { ensureNoAdminOrRedirect } from '@/server/domains/settings/install-gate'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { AdminInstallForm } from '@/ui/admin/auth/AdminInstallForm'
import { BrandLogo } from '@/ui/public/chrome/BrandLogo'

import type { Route } from './+types/index'

const ADMIN_INSTALL_FIELDS = ['title', 'name', 'email', 'password'] as const

export async function loader({ request, context }: Route.LoaderArgs) {
  // Possible outcomes:
  //   noAdmin   → render the admin-credentials form.
  //   installed → 303 → /admin/signin
  await ensureNoAdminOrRedirect()

  // Pull the request context so we trip session middleware exactly once.
  getRouteRequestContext({ request, context })
  return data({})
}

export async function action({ request, context }: Route.ActionArgs) {
  // Same gate as the loader. A POST that races a concurrent install
  // would still be caught by `signUpInitialAdminWithSession`'s own
  // `hasAdmin()` check (returns 409), so the redirect here is a UX
  // courtesy, not a security boundary.
  await ensureNoAdminOrRedirect()

  const { session, clientAddress } = getRouteRequestContext({ request, context })
  return processAuthFormSubmission({
    request,
    schema: signUpAdminSchema,
    fields: ADMIN_INSTALL_FIELDS,
    defaultErrorMessage: '请填写完整的管理员账号信息。',
    redirectTo: undefined,
    run: (input) => signUpInitialAdminWithSession({ ...input, session, request, clientAddress }),
  })
}

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '创建站点' }, bundleFromMatches(matches))
}

export default function AdminInstallRoute({ actionData }: Route.ComponentProps) {
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

      <AdminInstallForm />
    </div>
  )
}
