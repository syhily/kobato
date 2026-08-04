import { mintPreviewToken } from '@kobato/server/domains/preview-token/service'
import { authorProc } from '@kobato/server/http/orpc-base'
import { z } from 'zod'

// Draft-preview credential mint (plan 0.5 §5 "preview 凭证化"): the admin
// app (core domain) issues a short-lived, role-bound preview token that
// the public frontend carries in the preview URL (`?preview_token=…`) and
// forwards to the Content API procedures — the session cookie cannot cross
// the two-domain topology, so the token IS the preview authorization.
// Role-bound: an author mint gets `author` (post drafts only, enforced by
// the posts adapter at verify time); an admin mint gets `admin` (post +
// page drafts). The mint itself runs behind `authorProc`, so only
// author/admin sessions can obtain one.
const mint = authorProc
  .route({ method: 'POST', path: '/preview-token/mint' })
  .output(z.object({ token: z.string() }))
  .handler(async ({ context }) => ({
    token: mintPreviewToken(context.viewer.role === 'admin' ? 'admin' : 'author'),
  }))

export const adminPreviewTokenRouter = { mint }
