import { z } from 'zod'

export const RUM_INTAKE_PATH = '/api/rum/intake'

export const publicRumStatusInputSchema = z.object({}).strict()
export type PublicRumStatusInput = z.infer<typeof publicRumStatusInputSchema>

export const publicRumStatusOutputSchema = z.object({ enabled: z.boolean() }).strict()
export type PublicRumStatusOutput = z.infer<typeof publicRumStatusOutputSchema>

export const rumIntakeInputSchema = z.object({
  track: z.string(),
  query: z.string(),
  body: z.string(),
  contentType: z.string().nullable(),
})
export type RumIntakeInput = z.infer<typeof rumIntakeInputSchema>

export const rumIntakeAcceptedSchema = z.object({ kind: z.literal('accepted') })

export const rumIntakeErrorSchema = z.object({
  kind: z.literal('error'),
  status: z.union([z.literal(404), z.literal(413), z.literal(414), z.literal(429), z.literal(502)]),
  message: z.string(),
  retryAfterSeconds: z.number().int().optional(),
})

export const rumIntakeOutputSchema = z.union([rumIntakeAcceptedSchema, rumIntakeErrorSchema])
export type RumIntakeOutput = z.infer<typeof rumIntakeOutputSchema>
