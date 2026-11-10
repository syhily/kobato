import { z } from 'zod'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { coerceBoolean } from '@/server/domains/settings/sections/shared'
import {
  isSecureObservabilityOrigin,
  normalizeObservabilityOrigin,
  OBSERVABILITY_ORGANIZATION_PATTERN,
} from '@/shared/config/observability'

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
  })
  .default({ enabled: false, sessionSampleRate: 100 })

const logsWriteSchema = z
  .object({ enabled: coerceBoolean.default(false) })
  .strict()
  .default({ enabled: false })
const frontendWriteSchema = z
  .object({
    enabled: coerceBoolean.default(false),
    sessionSampleRate: z.coerce.number().min(0).max(100).default(100),
  })
  .strict()
  .default({ enabled: false, sessionSampleRate: 100 })

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
  logs: logsReadSchema,
  frontend: frontendReadSchema,
  rumClientToken: z.string().max(4096).optional(),
  /** Fingerprint of the configuration that last passed a connection test. */
  verifiedFingerprint: z.string().max(128).default(''),
  /** Fingerprint of the provisioned OpenObserve assets (P2). */
  provisionedFingerprint: z.string().max(128).default(''),
}

export const observabilitySchema = z.object({ observability: z.object(observabilityShape) })

export const observabilityWriteSchema = z
  .object({
    observability: z.object({ ...observabilityShape, logs: logsWriteSchema, frontend: frontendWriteSchema }).strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const site = value.observability
    if (site.endpoint !== '' && !isSecureObservabilityOrigin(site.endpoint)) {
      // Distinguish "not an origin" from "plain http to a remote host" so the
      // admin gets the actionable one.
      ctx.addIssue({
        code: 'custom',
        path: ['observability', 'endpoint'],
        message:
          normalizeObservabilityOrigin(site.endpoint) === null
            ? observabilityValidationMessages.endpointInvalid
            : observabilityValidationMessages.endpointHttps,
      })
    }
    if (site.organization !== '' && !OBSERVABILITY_ORGANIZATION_PATTERN.test(site.organization)) {
      ctx.addIssue({
        code: 'custom',
        path: ['observability', 'organization'],
        message: observabilityValidationMessages.organizationInvalid,
      })
    }
  })

export const observabilityDefaults = {
  observability: {
    enabled: false,
    endpoint: '',
    organization: '',
    username: '',
    password: '',
    sampleRate: 1,
    includeRedactedSql: false,
    logs: { enabled: false },
    frontend: { enabled: false, sessionSampleRate: 100 },
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
