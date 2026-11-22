import { authMessageDescriptorSchema } from '@kobato/api/contracts/auth'
import { z } from 'zod'

export const setupStatusInput = z.object({})
export type SetupStatusInput = z.input<typeof setupStatusInput>

export const setupStatusOutputSchema = z.object({
  setupTokenVerified: z.boolean(),
  csrfToken: z.string().nullable(),
})
export type SetupStatusOutput = z.infer<typeof setupStatusOutputSchema>

export const setupVerifyTokenInput = z.object({ token: z.string() })
export type SetupVerifyTokenInput = z.input<typeof setupVerifyTokenInput>

export const setupVerifyTokenOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('verified') }),
  z.object({
    kind: z.literal('error'),
    message: z.string(),
    descriptor: authMessageDescriptorSchema.optional(),
    status: z.literal(429).optional(),
  }),
])
export type SetupVerifyTokenOutput = z.infer<typeof setupVerifyTokenOutputSchema>
export type SetupVerifyTokenError = Extract<SetupVerifyTokenOutput, { kind: 'error' }>

// Plain strings on purpose: the server's signUpAdminSchema safeParse owns the per-field error copy — an unsupported
// locale or empty field must surface the auth.setup.error.* descriptors, never an oRPC BAD_REQUEST.
export const setupInstallInput = z.object({
  title: z.string(),
  name: z.string(),
  email: z.string(),
  password: z.string(),
  locale: z.string().optional(),
})
export type SetupInstallInput = z.input<typeof setupInstallInput>
