import { rumClientIdentitySchema } from '@kobato/settings/rum-client-identity.ts'
import { z } from 'zod'

/**
 * The narrow browser-safe RUM bootstrap the root loader may return. It
 * deliberately carries no OpenObserve endpoint and no credential: the browser
 * SDK posts every intake batch to the same-origin `/api/rum/intake` relay,
 * which attaches the real RUM client token server-side. Neither the server OTLP
 * authorization header nor the RUM client token ever reaches a document.
 */
export const frontendRumBootstrapSchema = z
  .object({
    /** The site name doubles as the RUM application id. */
    applicationId: z.string().min(1),
    service: z.string().min(1),
    environment: z.enum(['development', 'production']),
    sessionSampleRate: z.number().min(0).max(100),
    /** `forward` requires the visitor's privacy consent before any collection. */
    clientIdentity: rumClientIdentitySchema,
  })
  .strict()

export type FrontendRumBootstrap = z.infer<typeof frontendRumBootstrapSchema>

/**
 * The placeholder the browser SDK sends as its `clientToken`. The slim SDK
 * refuses to initialize without a non-empty token, but the value never leaves
 * the same-origin relay: the server intake rewrites every `o2-api-key` query
 * parameter with the real RUM client token before forwarding to OpenObserve.
 */
export const RUM_RELAY_CLIENT_TOKEN = 'kobato-relay'

/** Same-origin relay prefix the browser SDK posts to. */
export const RUM_INTAKE_PATH = '/api/rum/intake'
