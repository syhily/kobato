// Admin observability wire contract: connection test, provisioning, and the
// read-only status projection the three admin cards render.
//
// Structured data only — the UI owns every label. Errors travel as the shared
// `ErrorMessageDescriptor` contract (`ApiErrorData`), never as prose here.

import { z } from 'zod'

export const observabilityRuntimePhaseSchema = z.enum(['disabled', 'unverified', 'invalid', 'running', 'failed'])

export const observabilityProvisionStepSchema = z.enum(['created', 'exists'])

const errorMessageParamsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))

/** Wire shape of `ErrorMessageDescriptor` for a non-throwing failure payload. */
export const observabilityErrorDescriptorSchema = z
  .object({
    messageKey: z.string(),
    params: errorMessageParamsSchema.optional(),
    fallbackMessage: z.string(),
  })
  .strict()

/** Steps a successful provisioning run reports (shared by `provision` and the auto-provision step of `testConnection`). */
export const observabilityProvisionSummarySchema = z
  .object({
    organization: observabilityProvisionStepSchema,
    rumToken: observabilityProvisionStepSchema,
    pipeline: z.literal('installed'),
    dashboards: z.number().int().nonnegative(),
    provisionedFingerprint: z.string().min(1),
  })
  .strict()

/**
 * Auto-provision outcome of a connection test. A failed outcome is NOT a
 * failed connection: `ok: true` still means the fingerprint was verified and
 * persisted; only the asset sync needs a retry (`admin.observability.provision`).
 */
export const observabilityProvisionOutcomeSchema = z.discriminatedUnion('status', [
  observabilityProvisionSummarySchema.extend({ status: z.literal('succeeded') }).strict(),
  z.object({ status: z.literal('failed'), descriptor: observabilityErrorDescriptorSchema }).strict(),
])

export const observabilityTestConnectionInputSchema = z.object({}).strict()

export const observabilityTestConnectionOutputSchema = z
  .object({
    ok: z.literal(true),
    /** OpenObserve release version, when the authenticated config endpoint reports one. */
    version: z.string().nullable(),
    organization: observabilityProvisionStepSchema,
    provision: observabilityProvisionOutcomeSchema,
  })
  .strict()

export const observabilityProvisionInputSchema = z.object({}).strict()

export const observabilityProvisionOutputSchema = observabilityProvisionSummarySchema

export const observabilityStatusInputSchema = z.object({}).strict()

/** Latest OTLP export failure observed by the running runtime (error class name only, never a message). */
export const observabilityExportErrorSchema = z
  .object({
    signal: z.enum(['traces', 'metrics', 'logs']),
    error: z.string(),
    /** Epoch milliseconds. */
    at: z.number(),
  })
  .strict()

export const observabilityStatusOutputSchema = z
  .object({
    runtime: z
      .object({
        phase: observabilityRuntimePhaseSchema,
        lastError: z.string().nullable(),
        /** Null while every signal exports cleanly or no runtime is active. */
        lastExportError: observabilityExportErrorSchema.nullable(),
      })
      .strict(),
    /** The saved connection matches the last successful test (the fingerprint itself is never returned). */
    verified: z.boolean(),
    /** Assets were provisioned at least once. */
    provisioned: z.boolean(),
    /** The stored provisioned fingerprint matches the assets bundled in this build. */
    provisionedCurrent: z.boolean(),
    /** Last version observed by a connection test in this process. */
    version: z.string().nullable(),
  })
  .strict()

export type ObservabilityProvisionSummary = z.infer<typeof observabilityProvisionSummarySchema>
export type ObservabilityProvisionOutcome = z.infer<typeof observabilityProvisionOutcomeSchema>
export type ObservabilityTestConnectionOutput = z.infer<typeof observabilityTestConnectionOutputSchema>
export type ObservabilityProvisionOutput = z.infer<typeof observabilityProvisionOutputSchema>
export type ObservabilityStatusOutput = z.infer<typeof observabilityStatusOutputSchema>
