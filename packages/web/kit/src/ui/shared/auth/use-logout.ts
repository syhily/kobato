import { orpc, setCsrfToken } from '@kobato/api/browser/client'
import { useDocumentCsrfToken } from '@kobato/ui/lib/use-document-csrf-token'
import { useCallback } from 'react'

export function useLogout(): (redirectTo: string) => Promise<void> {
  const csrfToken = useDocumentCsrfToken()
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
