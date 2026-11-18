import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import { rumClientIdentitySchema } from '@kobato/settings/rum-client-identity.ts'
import { coerceBoolean } from '@kobato/settings/sections/shared.ts'
import { z } from 'zod'

/** Custom validation messages: typed UI-catalog ids (mapped to descriptors on write). */
export const observabilityValidationMessages = {
  endpointInvalid: 'admin.settings.observability.error.endpointInvalid',
  endpointHttps: 'admin.settings.observability.error.endpointHttps',
  organizationInvalid: 'admin.settings.observability.error.organizationInvalid',
} as const satisfies Record<string, UiMessageId>

// The runtime authority is `infra/trace/config.ts`; it re-validates every value
// on activation. The read schema stays permissive so a hand-edited row cannot
// silently fall back to the section defaults, while the WRITE schema applies the
// same origin/site-name grammar for immediate feedback.
const logsReadSchema = z.object({ enabled: coerceBoolean.default(false) }).default({ enabled: false })
const frontendReadSchema = z
  .object({
    enabled: coerceBoolean.default(false),
    sessionSampleRate: z.coerce.number().min(0).max(100).default(100),
    // Read-tolerant: a hand-edited row falls back to `anonymous`.
    clientIdentity: rumClientIdentitySchema.catch('anonymous').default('anonymous'),
  })
  .default({ enabled: false, sessionSampleRate: 100, clientIdentity: 'anonymous' })

const logsWriteSchema = z
  .object({ enabled: coerceBoolean.default(false) })
  .strict()
  .default({ enabled: false })
const frontendWriteSchema = z
  .object({
    enabled: coerceBoolean.default(false),
    sessionSampleRate: z.coerce.number().min(0).max(100).default(100),
    clientIdentity: rumClientIdentitySchema.default('anonymous'),
  })
  .strict()
  .default({ enabled: false, sessionSampleRate: 100, clientIdentity: 'anonymous' })

const observabilityShape = {
  enabled: coerceBoolean.default(false),
  endpoint: z.string().trim().max(500).default(''),
  organization: z.string().trim().max(64).default(''),
  username: z.string().trim().max(320).default(''),
  // Credentials: `undefined` means "keep the stored value", any string
  // (including empty) is a deliberate overwrite.
  password: z.string().max(512).optional(),
  sampleRate: z.coerce.number().min(0).max(1).default(1),
  includeRedactedSql: coerceBoolean.default(false),
  // Opt-in stream retention: 0 leaves the operator's OpenObserve policy alone.
  retentionDays: z.coerce.number().int().min(0).max(3650).default(0),
  logs: logsReadSchema,
  frontend: frontendReadSchema,
  rumClientToken: z.string().max(4096).optional(),
  /** Fingerprint of the configuration that last passed a connection test. */
  verifiedFingerprint: z.string().max(128).default(''),
  /** Fingerprint of the provisioned OpenObserve assets. */
  provisionedFingerprint: z.string().max(128).default(''),
}

export const observabilitySchema = z.object({ observability: z.object(observabilityShape) })

export const observabilityWriteSchema = z
  .object({
    observability: z.object({ ...observabilityShape, logs: logsWriteSchema, frontend: frontendWriteSchema }).strict(),
  })
  .strict()

export const observabilityDefaults = {
  observability: {
    enabled: false,
    endpoint: '',
    organization: '',
    username: '',
    password: '',
    sampleRate: 1,
    includeRedactedSql: false,
    retentionDays: 0,
    logs: { enabled: false },
    frontend: { enabled: false, sessionSampleRate: 100, clientIdentity: 'anonymous' },
    rumClientToken: '',
    verifiedFingerprint: '',
    provisionedFingerprint: '',
  },
} as const

export const observabilitySection = {
  scope: 'blog.observability',
  key: 'observability',
  schema: observabilitySchema,
  writeSchema: observabilityWriteSchema,
  defaults: observabilityDefaults,
} as const
