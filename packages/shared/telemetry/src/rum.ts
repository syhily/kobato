import { rumClientIdentitySchema } from '@kobato/settings/sections/observability.ts'
import { z } from 'zod'

export const frontendRumBootstrapSchema = z
  .object({
    applicationId: z.string().min(1),
    service: z.string().min(1),
    environment: z.enum(['development', 'production']),
    sessionSampleRate: z.number().min(0).max(100),
    clientIdentity: rumClientIdentitySchema,
  })
  .strict()

export type FrontendRumBootstrap = z.infer<typeof frontendRumBootstrapSchema>

export const RUM_RELAY_CLIENT_TOKEN = 'kobato-relay'

export const RUM_INTAKE_PATH = '/api/rum/intake'
