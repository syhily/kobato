import { z } from 'zod'

/**
 * The narrow browser-safe RUM bootstrap the root loader may return
 * (ADR-0012). It deliberately carries no server OTLP credential: the RUM
 * client token is a separate, least-privilege value and the server
 * authorization header never leaves the server process.
 */
export const frontendRumBootstrapSchema = z
  .object({
    /** OpenObserve origin, already validated as an https-or-loopback URL. */
    site: z.url(),
    organization: z.string().min(1),
    applicationId: z.string().min(1),
    clientToken: z.string().min(1),
    service: z.string().min(1),
    environment: z.enum(['development', 'production']),
    sessionSampleRate: z.number().min(0).max(100),
  })
  .strict()

export type FrontendRumBootstrap = z.infer<typeof frontendRumBootstrapSchema>
