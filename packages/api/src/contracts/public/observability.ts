import { z } from 'zod'

export const RUM_INTAKE_PATH = '/api/rum/intake'

export const publicRumStatusInputSchema = z.object({}).strict()
export type PublicRumStatusInput = z.infer<typeof publicRumStatusInputSchema>

export const publicRumStatusOutputSchema = z.object({ enabled: z.boolean() }).strict()
export type PublicRumStatusOutput = z.infer<typeof publicRumStatusOutputSchema>
