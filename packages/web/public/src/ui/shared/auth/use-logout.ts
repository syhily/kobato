import { useCallback } from 'react'
import { useRouteLoaderData } from 'react-router'

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
