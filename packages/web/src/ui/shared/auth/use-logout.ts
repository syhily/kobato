import { useCallback } from 'react'
import { useRouteLoaderData } from 'react-router'

/**
 * Logout is POST + CSRF only (a GET variant would let any cross-site <img>
 * or link prefetch silently sign the user out). POSTs the signin route's
 * `action=logout` branch with the root loader's CSRF token, then
 * hard-navigates so every client-side cache drops with the session.
 */
export function useLogout(): (redirectTo: string) => Promise<void> {
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  const csrfToken = rootData?.csrfToken
  return useCallback(
    async (redirectTo: string) => {
      const query = new URLSearchParams({ action: 'logout', redirect_to: redirectTo })
      await fetch(`/admin/signin?${query.toString()}`, {
        method: 'POST',
        body: csrfToken ? new URLSearchParams({ csrf_token: csrfToken }) : null,
      })
      window.location.assign(redirectTo)
    },
    [csrfToken],
  )
}
