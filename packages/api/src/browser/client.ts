import { createKobatoClient } from '@kobato/api/client/create-client'

const csrfStore = { token: null as string | null }

export function setCsrfToken(token: string) {
  csrfStore.token = token
}

export const orpc = createKobatoClient({
  url: () => `${globalThis.location?.origin ?? 'http://localhost'}/rpc`,
  getHeaders: () => {
    const headers: Record<string, string> = {}
    if (csrfStore.token) {
      headers['X-CSRF-Token'] = csrfStore.token
    }
    return headers
  },
})
