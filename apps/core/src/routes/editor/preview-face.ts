import type { Role } from '@kobato/shared/utils/roles'

import { mintPreviewToken } from '@kobato/server/domains/preview-token/service'
import { serverConfig } from '@kobato/server/infra/config'

/**
 * Headless preview face for the editor routes (plan 0.5 §5): when
 * `public.frontendUrl` is configured (the frontend is a separate origin),
 * mint a short-lived, role-bound preview token and return the absolute
 * link face the editor shells attach to their "view on the public site"
 * links (`?preview_token=…`). `null` keeps the historical same-origin
 * links (single-origin / in-process deployments).
 */
export function editorPreviewFace(role: Role): { frontendUrl: string; token: string | null } | null {
  const frontendUrl = serverConfig.public.frontendUrl
  if (frontendUrl === '') {
    return null
  }
  return { frontendUrl, token: mintPreviewToken(role === 'admin' ? 'admin' : 'author') }
}
