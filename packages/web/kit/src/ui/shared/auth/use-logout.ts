import { orpc, setCsrfToken } from '@kobato/api/browser/client'
import { useCallback } from 'react'
import { useRouteLoaderData } from 'react-router'

export function useLogout(): (redirectTo: string) => Promise<void> {
  const rootData = useRouteLoaderData<{ csrfToken?: string }>('root')
  const csrfToken = rootData?.csrfToken
  return useCallback(
    async (redirectTo: string) => {
      if (csrfToken) {
        setCsrfToken(csrfToken)
      }
      try {
        const result = await orpc.account.auth.logout({ redirectTo })
        window.location.assign(result.type === 'redirect' ? result.to : redirectTo)
      } catch {
        window.location.assign(redirectTo)
      }
    },
    [csrfToken],
  )
}
