import { z } from 'zod'

export const passkeyAuthBeginInputSchema = z.object({
  email: z.email().optional(),
})
export type PasskeyAuthBeginInput = z.input<typeof passkeyAuthBeginInputSchema>

export const passkeyOptionsOutputSchema = z.object({ options: z.any() })

export const accountPasskeyListOutputSchema = z.object({
  credentials: z.array(
    z.object({
      id: z.string(),
      deviceName: z.string().nullable(),
      createdAt: z.string(),
      backedUp: z.boolean(),
    }),
  ),
})
export type AccountPasskeyListOutput = z.infer<typeof accountPasskeyListOutputSchema>

export const accountPasskeyRegisterBeginInput = z.object({ deviceName: z.string().max(100).optional() })
export type AccountPasskeyRegisterBeginInput = z.infer<typeof accountPasskeyRegisterBeginInput>

export const accountPasskeyRegisterBeginOutputSchema = passkeyOptionsOutputSchema

export const accountPasskeyRegisterFinishInput = z.object({
  response: z.any(),
  deviceName: z.string().max(100).optional(),
  challenge: z.string().min(1),
})
export type AccountPasskeyRegisterFinishInput = z.infer<typeof accountPasskeyRegisterFinishInput>

export const accountPasskeyDeleteInput = z.object({ credentialId: z.string().min(1) })
export type AccountPasskeyDeleteInput = z.infer<typeof accountPasskeyDeleteInput>
