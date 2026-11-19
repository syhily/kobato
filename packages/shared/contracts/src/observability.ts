import { z } from 'zod'

export const observabilityRuntimePhaseSchema = z.enum(['disabled', 'unverified', 'invalid', 'running', 'failed'])

export const observabilityProvisionStepSchema = z.enum(['created', 'exists'])

const errorMessageParamsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))

export const observabilityErrorDescriptorSchema = z
  .object({
    messageKey: z.string(),
    params: errorMessageParamsSchema.optional(),
    fallbackMessage: z.string(),
  })
  .strict()

export const observabilityProvisionSummarySchema = z
  .object({
    organization: observabilityProvisionStepSchema,
    rumToken: observabilityProvisionStepSchema,
    pipeline: z.literal('installed'),
    dashboards: z.number().int().nonnegative(),
    provisionedFingerprint: z.string().min(1),
  })
  .strict()

export const observabilityProvisionOutcomeSchema = z.discriminatedUnion('status', [
  observabilityProvisionSummarySchema.extend({ status: z.literal('succeeded') }).strict(),
  z.object({ status: z.literal('failed'), descriptor: observabilityErrorDescriptorSchema }).strict(),
])

export const observabilityTestConnectionInputSchema = z.object({}).strict()

export const observabilityTestConnectionOutputSchema = z
  .object({
    ok: z.literal(true),
    version: z.string().nullable(),
    organization: observabilityProvisionStepSchema,
    provision: observabilityProvisionOutcomeSchema,
  })
  .strict()

export const observabilityProvisionInputSchema = z.object({}).strict()

export const observabilityProvisionOutputSchema = observabilityProvisionSummarySchema

export const observabilityStatusInputSchema = z.object({}).strict()

export const observabilityExportErrorSchema = z
  .object({
    signal: z.enum(['traces', 'metrics', 'logs']),
    error: z.string(),
    at: z.number(),
  })
  .strict()

export const observabilityStatusOutputSchema = z
  .object({
    runtime: z
      .object({
        phase: observabilityRuntimePhaseSchema,
        lastError: z.string().nullable(),
        lastExportError: observabilityExportErrorSchema.nullable(),
      })
      .strict(),
    verified: z.boolean(),
    provisioned: z.boolean(),
    provisionedCurrent: z.boolean(),
    version: z.string().nullable(),
  })
  .strict()

export type ObservabilityProvisionSummary = z.infer<typeof observabilityProvisionSummarySchema>
export type ObservabilityProvisionOutcome = z.infer<typeof observabilityProvisionOutcomeSchema>
export type ObservabilityTestConnectionOutput = z.infer<typeof observabilityTestConnectionOutputSchema>
export type ObservabilityProvisionOutput = z.infer<typeof observabilityProvisionOutputSchema>
export type ObservabilityStatusOutput = z.infer<typeof observabilityStatusOutputSchema>
